import "reflect-metadata"; // @peculiar/x509 が要求するポリフィル（最初に読み込む）。
import * as x509 from "@peculiar/x509";
import { CompactSign } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { AppleAppStoreVerifier, normalizeAppStoreNotification } from "./apple-appstore-verifier";

// ------------------------------------------------------------
// テスト用の証明書チェーン（自作CA → 葉）を作り、実際に JWS を署名して検証経路を通す。
// 「信頼アンカー（ルート）を差し替えられる」設計を利用して正常系を、
// 既定（Apple ルート固定）で偽チェーンの拒否を検証する。
// ------------------------------------------------------------

const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

/** ECDSA 鍵ペアを作る（generateKey の戻り型 union を CryptoKeyPair に絞る）。 */
async function genKeys(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
}

let rootB64: string;
let leafKeys: CryptoKeyPair;
let x5c: string[];

async function signJws(payload: unknown, keys: CryptoKeyPair, chain: string[]): Promise<string> {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ES256", x5c: chain })
    .sign(keys.privateKey);
}

const TX = {
  bundleId: "jp.co.plaria.rigel",
  productId: "rigel.pro.monthly",
  originalTransactionId: "orig-1",
  expiresDate: 1780000000000,
};

beforeAll(async () => {
  x509.cryptoProvider.set(crypto);
  const caKeys = await genKeys();
  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Root CA",
    notBefore: new Date("2026-01-01"),
    notAfter: new Date("2039-01-01"),
    keys: caKeys,
    signingAlgorithm: ALG,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  leafKeys = await genKeys();
  const leafCert = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=Test Leaf",
    issuer: caCert.subject,
    notBefore: new Date("2026-01-01"),
    notAfter: new Date("2039-01-01"),
    publicKey: leafKeys.publicKey,
    signingKey: caKeys.privateKey,
    signingAlgorithm: ALG,
  });
  rootB64 = b64(caCert.rawData);
  x5c = [b64(leafCert.rawData), rootB64];
});

describe("AppleAppStoreVerifier.verifyTransaction", () => {
  it("信頼アンカーに繋がる正しいチェーンの JWS を復号できる", async () => {
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const jws = await signJws(TX, leafKeys, x5c);
    const tx = await verifier.verifyTransaction(jws);
    expect(tx).toEqual({
      bundleId: "jp.co.plaria.rigel",
      productId: "rigel.pro.monthly",
      originalTransactionId: "orig-1",
      expiresDate: 1780000000000,
    });
  });

  it("既定（Apple ルート固定）ではテスト用チェーンの JWS を拒否する", async () => {
    const verifier = new AppleAppStoreVerifier();
    const jws = await signJws(TX, leafKeys, x5c);
    await expect(verifier.verifyTransaction(jws)).rejects.toThrow();
  });

  it("葉と違う鍵で署名した JWS は拒否する（チェーンだけ本物でも通らない）", async () => {
    const otherKeys = await genKeys();
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const jws = await signJws(TX, otherKeys, x5c);
    await expect(verifier.verifyTransaction(jws)).rejects.toThrow();
  });
});

describe("AppleAppStoreVerifier.parseNotification", () => {
  it("DID_RENEW（signedTransactionInfo 内包）を subscribed に正規化する", async () => {
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const inner = await signJws(TX, leafKeys, x5c);
    const payload = {
      notificationType: "DID_RENEW",
      data: { bundleId: TX.bundleId, signedTransactionInfo: inner },
    };
    const outer = await signJws(payload, leafKeys, x5c);
    const n = await verifier.parseNotification(outer);
    expect(n).toEqual({
      type: "subscribed",
      transaction: {
        bundleId: TX.bundleId,
        productId: TX.productId,
        originalTransactionId: "orig-1",
        expiresDate: TX.expiresDate,
      },
    });
  });
});

describe("normalizeAppStoreNotification（純関数）", () => {
  const tx = {
    bundleId: "b",
    productId: "p",
    originalTransactionId: "orig-1",
    expiresDate: null,
  };
  it("加入・更新・プラン変更は subscribed", () => {
    for (const t of ["SUBSCRIBED", "DID_RENEW", "DID_CHANGE_RENEWAL_PREF", "OFFER_REDEEMED"]) {
      expect(normalizeAppStoreNotification(t, tx)).toEqual({ type: "subscribed", transaction: tx });
    }
  });
  it("失効・返金は revoked", () => {
    for (const t of ["EXPIRED", "REVOKE", "REFUND", "GRACE_PERIOD_EXPIRED"]) {
      expect(normalizeAppStoreNotification(t, tx)).toEqual({
        type: "revoked",
        originalTransactionId: "orig-1",
      });
    }
  });
  it("自動更新のON/OFF切替（DID_CHANGE_RENEWAL_STATUS）等は無視（期限までは有効なまま）", () => {
    expect(normalizeAppStoreNotification("DID_CHANGE_RENEWAL_STATUS", tx)).toEqual({
      type: "ignored",
    });
    expect(normalizeAppStoreNotification("TEST", tx)).toEqual({ type: "ignored" });
  });
  it("トランザクションが取れない通知は無視", () => {
    expect(normalizeAppStoreNotification("DID_RENEW", null)).toEqual({ type: "ignored" });
  });
});
