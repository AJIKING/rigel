import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LandingScreen } from "./LandingScreen";

// ヘッダーはアプリ共通の AppHeader（useAuth / useRouter 依存）なのでモックする。
vi.mock("../lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// LP v6（2026-07-29 オーナー合意）: product-led hero + 四風の bento。
// 牌・盤面・グラフ・共有カードはサービス実装の実部品を使う（CSS の見立てにしない）。
describe("LandingScreen", () => {
  it("見出し・キッカー・ブランドを表示する", () => {
    render(<LandingScreen />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.replace(/\s/g, "")).toContain("麻雀の記録を、撮るだけで。");
    expect(screen.getByText(/雀力を高める/)).toBeTruthy();
    // ブランドはヘッダーとフッターの2箇所。
    expect(screen.getAllByText("RAISHA").length).toBeGreaterThan(0);
  });

  it("ヘッダーはアプリ共通（AppHeader）＋ LP アンカーで統一する", () => {
    render(<LandingScreen />);
    const nav = within(screen.getByRole("banner"));
    // LP 固有のページ内アンカー。
    expect(nav.getByRole("link", { name: "できること" }).getAttribute("href")).toBe("#features");
    expect(nav.getByRole("link", { name: "プラン" }).getAttribute("href")).toBe("#plans");
    // アプリ共通ナビ（牌譜・何切る・特訓）。
    expect(nav.getByRole("link", { name: "牌譜" }).getAttribute("href")).toBe("/kifu");
    expect(nav.getByRole("link", { name: "何切る" }).getAttribute("href")).toBe("/problems");
    expect(nav.getByRole("link", { name: "特訓" }).getAttribute("href")).toBe("/training");
    expect(nav.getByRole("link", { name: "サインイン" }).getAttribute("href")).toBe("/login");
  });

  it("主要導線のリンク先が正しい", () => {
    render(<LandingScreen />);
    expect(screen.getByRole("link", { name: "サインイン" }).getAttribute("href")).toBe("/login");
    // 「無料ではじめる」はヒーローと「まずは見てみる」カードの2箇所（どちらも /login）。
    for (const link of screen.getAllByRole("link", { name: "無料ではじめる" })) {
      expect(link.getAttribute("href")).toBe("/login");
    }
    expect(screen.getByRole("link", { name: "サインインせずに見る" }).getAttribute("href")).toBe(
      "/kifu",
    );
  });

  it("ヒーローは実部品の盤面（ViewBoard）を実データで描く", () => {
    render(<LandingScreen />);
    // ViewBoard の実描画（data-tile はレイアウト検証用の安定フック）。
    expect(document.querySelectorAll("[data-tile]").length).toBeGreaterThan(10);
    expect(screen.getByText("東一局")).toBeTruthy();
  });

  it("四風の bento カード（牌譜化/公開・共有/何切る/特訓）が並ぶ", () => {
    render(<LandingScreen />);
    // 「何切る」「特訓」はナビ等にも出るため getAllBy で存在だけを固定する。
    for (const label of ["牌譜化", "公開・共有", "何切る", "特訓"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    // 南: 共有は実 OGP デザイン（/k の opengraph-image と同じ構図）の SNS 埋め込み風。
    expect(screen.getAllByText("7/28 友人戦").length).toBeGreaterThan(0);
    expect(screen.getByText("raisha.jp")).toBeTruthy();
    // 北: 特訓グラフはサービス実装の QuizLineChart（種目名の見出しを持つ）。
    expect(screen.getByRole("group", { name: "清一色 何待ち" })).toBeTruthy();
  });

  it("プラン3種を web 価格で出す", () => {
    render(<LandingScreen />);
    expect(screen.getByText("¥480")).toBeTruthy();
    expect(screen.getByText("¥1,480")).toBeTruthy();
    expect(screen.getByText(/ずっと無料/)).toBeTruthy();
  });
});
