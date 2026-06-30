import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingScreen } from "./LandingScreen";

describe("LandingScreen", () => {
  it("見出しとブランド名を表示する", () => {
    render(<LandingScreen />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.replace(/\s/g, "")).toContain("牌譜をAIで再現");
    expect(screen.getByText("RIGEL")).toBeTruthy();
  });

  it("主要導線のリンク先が正しい", () => {
    render(<LandingScreen />);
    expect(screen.getByRole("link", { name: "ログイン" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("link", { name: /Google ではじめる/ }).getAttribute("href")).toBe(
      "/login",
    );
    expect(screen.getByRole("link", { name: "公開牌譜を見る" }).getAttribute("href")).toBe("/kifu");
  });
});
