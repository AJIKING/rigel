import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KifuViewer } from "./KifuViewer";

describe("KifuViewer", () => {
  it("取得できない公開半荘は非公開/不在の案内を出す", async () => {
    render(<KifuViewer gameId="missing" />);
    expect(await screen.findByText(/非公開/)).toBeTruthy();
  });
});
