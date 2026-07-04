// ============================================================
// infrastructure/billing — AppStoreVerifier の Apple(StoreKit 2) 実装
// ------------------------------------------------------------
// StoreKit 2 の署名済みトランザクション / Server Notifications V2 は
// 「x5c 証明書チェーン付き JWS」。検証手順:
//   1. x5c のルートが固定した Apple Root CA - G3 と一致すること（信頼アンカー）
//   2. チェーンの各証明書が上位に署名されていること（@peculiar/x509）
//   3. 葉証明書の公開鍵で JWS 署名が正しいこと（jose）
// ネットワーク不要・Workers 互換。テストではルートを差し替えて経路を検証する。
// ============================================================

import "reflect-metadata"; // @peculiar/x509（内部の tsyringe）が要求するポリフィル。
import * as x509 from "@peculiar/x509";
import { compactVerify, decodeProtectedHeader, importX509 } from "jose";
import type { AppStoreNotification, AppStoreTransaction } from "../../domain/billing/appstore";
import type { AppStoreVerifier } from "../../domain/billing/appstore";
import { APPLE_ROOT_CA_G3_DER_B64 } from "./apple-root-ca";

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
  return true;
}

/** 復号済みペイロード → 正規化トランザクション（未知フィールドは捨てる）。 */
function toTransaction(payload: Record<string, unknown>): AppStoreTransaction {
  return {
    productId: String(payload.productId ?? ""),
    bundleId: String(payload.bundleId ?? ""),
    originalTransactionId: String(payload.originalTransactionId ?? ""),
    expiresDate: typeof payload.expiresDate === "number" ? payload.expiresDate : null,
  };
}

/** 失効・返金 → free に落とす通知タイプ。 */
const REVOKE_TYPES = new Set(["EXPIRED", "REVOKE", "REFUND", "GRACE_PERIOD_EXPIRED"]);
/** 加入・更新・プラン変更 → 現在の商品のプランを反映する通知タイプ。 */
const SUBSCRIBE_TYPES = new Set([
  "SUBSCRIBED",
  "DID_RENEW",
  "DID_CHANGE_RENEWAL_PREF",
  "OFFER_REDEEMED",
]);

/**
 * 通知タイプ + 内包トランザクションを正規化イベントへ（純関数）。
 * DID_CHANGE_RENEWAL_STATUS（自動更新のON/OFF）は期限まで有効なので動かさない。
 */
export function normalizeAppStoreNotification(
  notificationType: string,
  tx: AppStoreTransaction | null,
): AppStoreNotification {
  if (!tx) return { type: "ignored" };
  if (REVOKE_TYPES.has(notificationType)) {
    return { type: "revoked", originalTransactionId: tx.originalTransactionId };
  }
  if (SUBSCRIBE_TYPES.has(notificationType)) {
    return { type: "subscribed", transaction: tx };
  }
  return { type: "ignored" };
}

export class AppleAppStoreVerifier implements AppStoreVerifier {
  private readonly rootDerB64: string;

  /** rootCaDerB64 は通常省略（Apple Root CA G3 固定）。テストでのみ差し替える。 */
  constructor(opts: { rootCaDerB64?: string } = {}) {
    this.rootDerB64 = opts.rootCaDerB64 ?? APPLE_ROOT_CA_G3_DER_B64;
  }

  /** x5c チェーンを検証し、葉の鍵で JWS を検証してペイロード(JSON)を返す。 */
  private async verifyJws(jws: string): Promise<Record<string, unknown>> {
    const header = decodeProtectedHeader(jws);
    const x5c = header.x5c;
    if (!Array.isArray(x5c) || x5c.length < 2) throw new Error("x5c チェーンがありません");

    const chain = x5c.map((c) => new x509.X509Certificate(b64ToBytes(c)));
    const root = chain[chain.length - 1]!;

    // 1. 信頼アンカー: ルートが固定した証明書と完全一致すること。
    const pinned = new x509.X509Certificate(b64ToBytes(this.rootDerB64));
    if (!bytesEqual(root.rawData, pinned.rawData)) {
      throw new Error("ルート証明書が Apple Root CA と一致しません");
    }

    // 2. チェーン: 各証明書が1つ上の証明書に署名されており、有効期間内であること。
    const now = new Date();
    for (let i = 0; i < chain.length - 1; i++) {
      const ok = await chain[i]!.verify({ publicKey: chain[i + 1]!.publicKey, date: now });
      if (!ok) throw new Error(`証明書チェーンの検証に失敗しました (${i})`);
    }
    if (!(await root.verify({ date: now }))) {
      throw new Error("ルート証明書の自己署名検証に失敗しました");
    }

    // 3. 葉証明書の公開鍵で JWS 本体の署名を検証する。
    const alg = typeof header.alg === "string" ? header.alg : "ES256";
    const leafKey = await importX509(chain[0]!.toString("pem"), alg);
    const { payload } = await compactVerify(jws, leafKey);
    return JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
  }

  async verifyTransaction(jws: string): Promise<AppStoreTransaction> {
    return toTransaction(await this.verifyJws(jws));
  }

  async parseNotification(signedPayload: string): Promise<AppStoreNotification> {
    const payload = await this.verifyJws(signedPayload);
    const notificationType = String(payload.notificationType ?? "");
    const data = payload.data as { signedTransactionInfo?: unknown } | undefined;
    const inner = data?.signedTransactionInfo;
    const tx = typeof inner === "string" ? toTransaction(await this.verifyJws(inner)) : null;
    return normalizeAppStoreNotification(notificationType, tx);
  }
}
