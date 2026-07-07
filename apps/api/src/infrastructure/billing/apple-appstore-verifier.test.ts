import { beforeAll, describe, expect, it } from "vitest";
import {
  createTestAppStoreChain,
  genAppStoreKeys,
  signAppStoreJws,
} from "../../test-support/appstore-jws";
import { AppleAppStoreVerifier, normalizeAppStoreNotification } from "./apple-appstore-verifier";

// ------------------------------------------------------------
// テスト用の証明書チェーン（自作CA → 葉。test-support/appstore-jws）で
// 実際に JWS を署名して検証経路を通す。「信頼アンカー（ルート）を差し替え
// られる」設計を利用して正常系を、既定（Apple ルート固定）で偽チェーンの
// 拒否を検証する。
// ------------------------------------------------------------

let rootB64: string;
let leafKeys: CryptoKeyPair;
let x5c: string[];

const signJws = signAppStoreJws;

const TX = {
  bundleId: "jp.co.plaria.rigel",
  productId: "rigel.pro.monthly",
  originalTransactionId: "orig-1",
  expiresDate: 1780000000000,
};

beforeAll(async () => {
  const chain = await createTestAppStoreChain();
  rootB64 = chain.rootDerB64;
  leafKeys = chain.leafKeys;
  x5c = chain.x5c;
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
    const otherKeys = await genAppStoreKeys();
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const jws = await signJws(TX, otherKeys, x5c);
    await expect(verifier.verifyTransaction(jws)).rejects.toThrow();
  });

  it("別のCA（別ルート）で作った正しいチェーンでも、信頼アンカー不一致なら拒否する", async () => {
    const foreign = await createTestAppStoreChain();
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const jws = await signJws(TX, foreign.leafKeys, foreign.x5c);
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

  it("EXPIRED（更新失敗の確定）を revoked に正規化する", async () => {
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const inner = await signJws(TX, leafKeys, x5c);
    const outer = await signJws(
      {
        notificationType: "EXPIRED",
        data: { bundleId: TX.bundleId, signedTransactionInfo: inner },
      },
      leafKeys,
      x5c,
    );
    expect(await verifier.parseNotification(outer)).toEqual({
      type: "revoked",
      originalTransactionId: "orig-1",
    });
  });

  it("signedTransactionInfo を欠く通知は ignored（誤ってプランを動かさない）", async () => {
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const outer = await signJws(
      { notificationType: "DID_RENEW", data: { bundleId: TX.bundleId } },
      leafKeys,
      x5c,
    );
    expect(await verifier.parseNotification(outer)).toEqual({ type: "ignored" });
  });

  it("内側の signedTransactionInfo が別鍵で署名されていたら通知ごと拒否する", async () => {
    const verifier = new AppleAppStoreVerifier({ rootCaDerB64: rootB64 });
    const otherKeys = await genAppStoreKeys();
    const forgedInner = await signJws(TX, otherKeys, x5c);
    const outer = await signJws(
      {
        notificationType: "DID_RENEW",
        data: { bundleId: TX.bundleId, signedTransactionInfo: forgedInner },
      },
      leafKeys,
      x5c,
    );
    await expect(verifier.parseNotification(outer)).rejects.toThrow();
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
