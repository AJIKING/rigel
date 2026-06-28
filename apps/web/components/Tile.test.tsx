import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tile } from "./Tile";

describe("Tile", () => {
  it("牌ラベルを表示する", () => {
    render(<Tile read={{ tile: "1m", confidence: 0.99 }} />);
    expect(screen.getByTestId("tile").textContent).toBe("1萬");
  });

  it("低confidenceは要確認(data-review)になる", () => {
    render(<Tile read={{ tile: "3m", confidence: 0.4 }} />);
    expect(screen.getByTestId("tile").getAttribute("data-review")).toBe("true");
  });

  it("読めない牌(null)は ? かつ要確認", () => {
    render(<Tile read={{ tile: null, confidence: 0 }} />);
    const el = screen.getByTestId("tile");
    expect(el.textContent).toBe("?");
    expect(el.getAttribute("data-review")).toBe("true");
  });
});
