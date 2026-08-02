// Stripe へ渡す戻り先 URL の許可リスト（オープンリダイレクト対策）の否定テスト。
// 2026-08-01 の品質調査で「許可リスト自体に否定ケースの検証が無い」と指摘された穴を塞ぐ。

import { describe, expect, it } from "vitest";
import { isAllowedRedirect } from "./redirect";

const ALLOWED = "https://raisha.jp";

describe("isAllowedRedirect", () => {
  it("許可オリジン・アプリの scheme・ローカル開発は通す", () => {
    expect(isAllowedRedirect("https://raisha.jp/mypage?ok=1", ALLOWED)).toBe(true);
    expect(isAllowedRedirect("jp.co.plaria.rigel://billing-done", ALLOWED)).toBe(true);
    expect(isAllowedRedirect("http://localhost:3000/settings", ALLOWED)).toBe(true);
  });

  it("他人のオリジンは拒否する（任意サイトへの誘導を許さない）", () => {
    expect(isAllowedRedirect("https://evil.example/phish", ALLOWED)).toBe(false);
    // 紛らわしいサブドメイン/接尾辞も別オリジンとして拒否。
    expect(isAllowedRedirect("https://raisha.jp.evil.example/", ALLOWED)).toBe(false);
    expect(isAllowedRedirect("https://evilraisha.jp/", ALLOWED)).toBe(false);
  });

  it("スキームのすり替えは拒否する", () => {
    expect(isAllowedRedirect("javascript:alert(1)", ALLOWED)).toBe(false);
    expect(isAllowedRedirect("data:text/html,<script>1</script>", ALLOWED)).toBe(false);
    // 許可オリジンは https。http へのダウングレードは別オリジン扱い。
    expect(isAllowedRedirect("http://raisha.jp/", ALLOWED)).toBe(false);
  });

  it("URL として壊れた値・空の許可リストは拒否する（ローカル開発は例外的に通る）", () => {
    expect(isAllowedRedirect("not a url", ALLOWED)).toBe(false);
    expect(isAllowedRedirect("https://raisha.jp/", undefined)).toBe(false);
    expect(isAllowedRedirect("http://localhost:3000/", undefined)).toBe(true);
  });

  it("ユーザー情報・ポートのすり替えは別オリジンとして拒否する", () => {
    expect(isAllowedRedirect("https://raisha.jp@evil.example/", ALLOWED)).toBe(false);
    expect(isAllowedRedirect("https://raisha.jp:8443/", ALLOWED)).toBe(false);
  });
});
