import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TermsScreen } from "./TermsScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), push: vi.fn() }) }));

describe("TermsScreen", () => {
  it("見出しと主要条文・制定者を表示する", () => {
    render(<TermsScreen />);
    expect(screen.getByRole("heading", { level: 1, name: "利用規約" })).toBeTruthy();
    expect(screen.getByText("本規約への同意、適用範囲")).toBeTruthy();
    expect(screen.getByText("準拠法")).toBeTruthy();
    expect(screen.getByText("株式会社PLARIA")).toBeTruthy();
  });

  it("禁止事項は14項目を列挙する", () => {
    render(<TermsScreen />);
    // 「第4条 禁止事項」の見出し直後の ol に 14 件。
    expect(screen.getByText("面識のない異性との出会いを目的とした行為")).toBeTruthy();
  });
});
