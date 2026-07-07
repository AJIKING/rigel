// ============================================================
// test-support — App Store 風の署名済み JWS を作るテスト基盤
// ------------------------------------------------------------
// StoreKit 2 / Server Notifications V2 と同じ「x5c 証明書チェーン付き JWS」を
// 自作CA（ルート）→ 葉 の実チェーンで署名する。AppleAppStoreVerifier の
// 「信頼アンカーを差し替えられる」設計と組み合わせ、実際の暗号検証経路を
// ネットワーク無しで通す（unit / HTTP 統合の両方で使う）。
// ============================================================

import "reflect-metadata"; // @peculiar/x509 が要求するポリフィル（最初に読み込む）。
import * as x509 from "@peculiar/x509";
import { CompactSign } from "jose";

const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
const b64 = (buf: ArrayBuffer) => Buffer.from(buf).toString("base64");

/** ECDSA 鍵ペアを作る（generateKey の戻り型 union を CryptoKeyPair に絞る）。 */
export async function genAppStoreKeys(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(ALG, true, ["sign", "verify"])) as CryptoKeyPair;
}

export interface TestAppStoreChain {
  /** 信頼アンカーとして Verifier に渡すルート証明書（DER, base64）。 */
  rootDerB64: string;
  /** JWS ヘッダに載せる証明書チェーン（葉 → ルート）。 */
  x5c: string[];
  /** 葉証明書に対応する鍵（正しい署名者）。 */
  leafKeys: CryptoKeyPair;
}

/** 自作CA→葉のチェーンを作る。ルートを Verifier の信頼アンカーに差し替えて使う。 */
export async function createTestAppStoreChain(): Promise<TestAppStoreChain> {
  x509.cryptoProvider.set(crypto);
  const caKeys = await genAppStoreKeys();
  const caCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Root CA",
    notBefore: new Date("2026-01-01"),
    notAfter: new Date("2039-01-01"),
    keys: caKeys,
    signingAlgorithm: ALG,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const leafKeys = await genAppStoreKeys();
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
  return {
    rootDerB64: b64(caCert.rawData),
    x5c: [b64(leafCert.rawData), b64(caCert.rawData)],
    leafKeys,
  };
}

/** ペイロードを x5c チェーン付き JWS に署名する（keys を替えれば改ざんの再現にも使える）。 */
export async function signAppStoreJws(
  payload: unknown,
  keys: CryptoKeyPair,
  x5c: string[],
): Promise<string> {
  return new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ES256", x5c })
    .sign(keys.privateKey);
}
