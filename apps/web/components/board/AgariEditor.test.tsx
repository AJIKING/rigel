import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KifuSchema, RULE_PRESETS, type Agari } from "@rigel/schema";
import { AgariEditor } from "./AgariEditor";

function kifuWith(agari: Partial<Agari> | null) {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "west" },
    rules: RULE_PRESETS.mleague,
    agari,
  });
}

describe("AgariEditor", () => {
  it("和了情報から打点を表示する（3飜40符の子ロン = 5200点）", () => {
    const kifu = kifuWith({
      winner: "east",
      from: "south",
      fu: 40,
      yaku: [{ name: "立直", han: 3 }],
    });
    render(<AgariEditor kifu={kifu} dealer="west" onAgari={() => {}} />);
    expect(screen.getByText("3飜40符")).toBeTruthy();
    expect(screen.getAllByText("5200点").length).toBeGreaterThan(0);
  });

  it("役ゼロ（ドラのみ）は警告を出す", () => {
    const kifu = kifuWith({ winner: "east", from: "south", fu: 30 });
    render(<AgariEditor kifu={kifu} dealer="west" onAgari={() => {}} />);
    expect(screen.getByText(/役がありません/)).toBeTruthy();
  });

  it("和了未設定なら詳細入力を出さない", () => {
    const kifu = kifuWith(null);
    render(<AgariEditor kifu={kifu} dealer="west" onAgari={() => {}} />);
    expect(screen.queryByText("和了牌")).toBeNull();
  });
});
