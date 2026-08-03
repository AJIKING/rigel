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

  it("rigel の核となる約束を明記する（画像は本人のみ閲覧・削除で消える、計測に PII を送らない・広告不使用）", () => {
    render(<PrivacyScreen />);
    // 画像は恒久保存へ転換（[決定] 2026-08-03 photo-retention.md）。所有者のみ閲覧・
    // データ削除で消える・目的外利用しない、の3点を明記する。
    expect(screen.getByText(/ご本人だけが閲覧/)).toBeTruthy();
    expect(screen.getByText(/退会（アカウント削除）により削除/)).toBeTruthy();
    expect(screen.getByText(/AI の学習など解析・表示以外の目的には使用しません/)).toBeTruthy();
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
