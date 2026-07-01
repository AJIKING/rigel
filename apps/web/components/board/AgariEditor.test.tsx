import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KifuSchema, RULE_PRESETS, type Agari } from "@rigel/schema";
import { AgariEditor } from "./AgariEditor";

function kifuWith(agari: Partial<Agari>[] | Partial<Agari> | null) {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "west" },
    rules: RULE_PRESETS.tenhou, // doubleRon 有効
    agari,
  });
}

describe("AgariEditor", () => {
  it("和了情報から打点を表示する（3飜40符の子ロン = 5200点）", () => {
    const kifu = kifuWith([
      { winner: "east", from: "south", fu: 40, yaku: [{ name: "立直", han: 3 }] },
    ]);
    render(<AgariEditor kifu={kifu} dealer="west" onChange={() => {}} />);
    expect(screen.getByText("3飜40符")).toBeTruthy();
    expect(screen.getAllByText("5200点").length).toBeGreaterThan(0);
  });

  it("役ゼロ（ドラのみ）は警告を出す", () => {
    const kifu = kifuWith([{ winner: "east", from: "south", fu: 30 }]);
    render(<AgariEditor kifu={kifu} dealer="west" onChange={() => {}} />);
    expect(screen.getByText(/役がありません/)).toBeTruthy();
  });

  it("和了が無ければ入力欄を出さず「和了を追加」を出す", () => {
    const kifu = kifuWith(null);
    render(<AgariEditor kifu={kifu} dealer="west" onChange={() => {}} />);
    expect(screen.queryByText("和了牌")).toBeNull();
    expect(screen.getByRole("button", { name: /和了を追加/ })).toBeTruthy();
  });

  it("「和了を追加」で agari エントリを増やす", () => {
    const onChange = vi.fn();
    const kifu = kifuWith([
      { winner: "east", from: "south", fu: 30, yaku: [{ name: "x", han: 1 }] },
    ]);
    render(<AgariEditor kifu={kifu} dealer="west" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /和了を追加/ }));
    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls[0][0]).toHaveLength(2);
  });
});
