import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it('ワードマーク "RIGEL" を表示する', () => {
    render(<BrandMark wordmarkClassName="wm" />);
    expect(screen.getByText("RIGEL")).toBeTruthy();
  });

  it("星とワードマークに className を渡せる（画面ごとの寸法調整用）", () => {
    const { container } = render(<BrandMark starClassName="st" wordmarkClassName="wm" />);
    expect(screen.getByText("RIGEL").className).toBe("wm");
    expect(container.querySelector("svg")?.getAttribute("class")).toBe("st");
  });
});
