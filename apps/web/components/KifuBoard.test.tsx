import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { sampleKifu } from "../lib/sample-kifu";
import { KifuBoard } from "./KifuBoard";

describe("KifuBoard", () => {
  it("盤面と4席を表示する", () => {
    render(<KifuBoard kifu={sampleKifu} />);
    expect(screen.getByTestId("kifu-board")).toBeDefined();
    for (const label of ["東家", "南家", "西家", "北家"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it("要確認の牌（低confidence/null）がハイライトされる", () => {
    render(<KifuBoard kifu={sampleKifu} />);
    const reviewed = screen
      .getAllByTestId("tile")
      .filter((t) => t.getAttribute("data-review") === "true");
    expect(reviewed.length).toBeGreaterThan(0);
  });
});
