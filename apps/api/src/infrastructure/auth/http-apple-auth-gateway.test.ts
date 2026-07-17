import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { buildAppleClientSecret } from "./http-apple-auth-gateway";

describe("buildAppleClientSecret（Apple の client secret = ES256 短命 JWT）", () => {
  it("iss=TeamID / sub=clientId / aud=appleid.apple.com / kid 付き ES256 で署名する", async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const now = new Date("2026-07-17T00:00:00.000Z");

    const secret = await buildAppleClientSecret(
      { teamId: "TEAM123", keyId: "KEY456", privateKey: pem },
      "jp.rigel.app",
      now,
    );

    const { payload, protectedHeader } = await jwtVerify(secret, publicKey, {
      issuer: "TEAM123",
      audience: "https://appleid.apple.com",
      // exp(発行+5分) の検証も now 基準（実時刻だと固定日時のテストが期限切れになる）。
      currentDate: now,
    });
    expect(protectedHeader.alg).toBe("ES256");
    expect(protectedHeader.kid).toBe("KEY456");
    expect(payload.sub).toBe("jp.rigel.app");
    // 短命（5分）。Apple の上限（6か月）よりはるかに短くリクエスト都度作る。
    expect(payload.exp).toBe(Math.floor(now.getTime() / 1000) + 300);
  });
});
