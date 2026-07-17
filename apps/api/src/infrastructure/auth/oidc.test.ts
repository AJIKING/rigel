import { describe, expect, it } from "vitest";
import { parseAudiences } from "./oidc";

// createIdTokenVerifier 本体は JWKS 取得(ネットワーク)が要るため Unit 対象外。
// aud に許可する client_id 群のパース（純粋関数）だけ検証する。
describe("parseAudiences（複数 client_id の許可）", () => {
  it("単一IDは1要素の配列にする", () => {
    expect(parseAudiences("web.apps.googleusercontent.com")).toEqual([
      "web.apps.googleusercontent.com",
    ]);
  });

  it("カンマ区切りを配列にし、前後の空白を除去する", () => {
    expect(parseAudiences("web.apps , ios.apps ,android.apps")).toEqual([
      "web.apps",
      "ios.apps",
      "android.apps",
    ]);
  });

  it("空要素は除外する", () => {
    expect(parseAudiences("web.apps,,")).toEqual(["web.apps"]);
  });
});
