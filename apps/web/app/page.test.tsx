import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home ページ", () => {
  it("見出しと牌種数を表示する", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { name: /麻雀牌譜/ })).toBeDefined();
    expect(screen.getByText(/牌種数/)).toBeDefined();
  });

  it("読めなかった/低confidenceの牌を要確認として表示する", () => {
    render(<Home />);
    // sampleReads のうち confidence 0.4 と null の2件が要確認ハイライトになる
    expect(screen.getAllByTestId("review")).toHaveLength(2);
  });
});
