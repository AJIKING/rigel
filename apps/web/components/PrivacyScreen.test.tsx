import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PrivacyScreen } from "./PrivacyScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

describe("PrivacyScreen", () => {
  it("見出しと主要セクション・制定者を表示する", () => {
    render(<PrivacyScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeTruthy();
    expect(screen.getByText("アカウントと取得する情報")).toBeTruthy();
    expect(screen.getByText("外部送信について")).toBeTruthy();
    expect(screen.getByText("退会・データの削除")).toBeTruthy();
    expect(screen.getByText("株式会社PLARIA")).toBeTruthy();
  });

  it("rigel の核となる約束を明記する（画像は一時利用・自動削除、計測に PII を送らない・広告不使用）", () => {
    render(<PrivacyScreen />);
    // 「保存しません」ではなく実態どおり（一時保管＋最長1日で自動削除。[決定] 2026-08-02）。
    expect(screen.getByText(/解析が完了すると自動的に削除/)).toBeTruthy();
    expect(screen.getByText(/最長1日で削除/)).toBeTruthy();
    expect(
      screen.getByText(/氏名・メールアドレス・牌譜の内容・撮影画像が送信されることはありません/),
    ).toBeTruthy();
    expect(screen.getByText(/広告識別子（IDFA \/ 広告ID）を収集しません/)).toBeTruthy();
  });

  it("外部送信の開示に主要事業者（GA4・Cloudflare・Stripe・RevenueCat）を含む", () => {
    render(<PrivacyScreen />);
    expect(screen.getByText(/Google アナリティクス \/ Firebase Analytics/)).toBeTruthy();
    expect(screen.getByText(/Cloudflare, Inc./)).toBeTruthy();
    expect(screen.getByText(/Stripe, Inc.（ウェブ決済）/)).toBeTruthy();
    expect(screen.getByText(/RevenueCat, Inc.（購読管理）/)).toBeTruthy();
  });

  it("目次から各セクションへ飛べる（アンカーリンク）", () => {
    render(<PrivacyScreen />);
    const toc = screen.getByRole("navigation", { name: "目次" });
    expect(toc).toBeTruthy();
    const link = screen.getByRole("link", { name: "7. 外部送信について" });
    expect(link.getAttribute("href")).toBe("#sec-7");
  });

  it("本文中の各社ポリシー URL はリンクになっている（別タブで開く）", () => {
    render(<PrivacyScreen />);
    const a = screen.getByRole("link", { name: "https://stripe.com/privacy" });
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toContain("noopener");
  });

  it("関連文書（利用規約）への導線がある", () => {
    render(<PrivacyScreen />);
    const link = screen.getByRole("link", { name: "利用規約" });
    expect(link.getAttribute("href")).toBe("/terms");
  });
});
