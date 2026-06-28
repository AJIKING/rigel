import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../lib/auth-context";
import { sampleKifu } from "../lib/sample-kifu";
import { KifuEditor } from "./KifuEditor";

// KifuEditor は useAuth を使うため AuthProvider で包む。
const withAuth = (node: ReactNode) => render(<AuthProvider>{node}</AuthProvider>);

describe("KifuEditor", () => {
  it("要確認の牌を一覧表示する", () => {
    withAuth(<KifuEditor initialKifu={sampleKifu} />);
    expect(screen.getByTestId("review-panel").textContent).toMatch(/要確認/);
    expect(screen.getAllByTestId("review-item").length).toBeGreaterThan(0);
  });

  it("要確認の牌を選んで正しい牌に直すと、要確認が1件減る", () => {
    withAuth(<KifuEditor initialKifu={sampleKifu} />);
    const before = screen.getAllByTestId("review-item").length;

    fireEvent.click(screen.getAllByTestId("review-item")[0]);
    // ピッカーが出る → 確定牌(1m)を選ぶ
    fireEvent.click(screen.getAllByTestId("pick-tile")[0]);

    expect(screen.getAllByTestId("review-item").length).toBe(before - 1);
  });

  it("未ログインでは保存ボタンが無効", () => {
    withAuth(<KifuEditor initialKifu={sampleKifu} kifuId="l1" />);
    const save = screen.getByRole("button", { name: "修正を保存" });
    expect(save).toHaveProperty("disabled", true);
  });
});
