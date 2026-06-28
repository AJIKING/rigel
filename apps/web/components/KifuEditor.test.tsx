import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleKifu } from "../lib/sample-kifu";
import { KifuEditor } from "./KifuEditor";

describe("KifuEditor", () => {
  it("要確認の牌を一覧表示する", () => {
    render(<KifuEditor initialKifu={sampleKifu} />);
    expect(screen.getByTestId("review-panel").textContent).toMatch(/要確認/);
    expect(screen.getAllByTestId("review-item").length).toBeGreaterThan(0);
  });

  it("要確認の牌を選んで正しい牌に直すと、要確認が1件減る", () => {
    render(<KifuEditor initialKifu={sampleKifu} />);
    const before = screen.getAllByTestId("review-item").length;

    fireEvent.click(screen.getAllByTestId("review-item")[0]);
    // ピッカーが出る → 確定牌(1m)を選ぶ
    fireEvent.click(screen.getAllByTestId("pick-tile")[0]);

    expect(screen.getAllByTestId("review-item").length).toBe(before - 1);
  });
});
