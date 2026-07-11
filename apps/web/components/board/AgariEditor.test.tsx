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

  it("門前/鳴きは手動で切り替えられ、食い下がり飜が更新される（副露未記録の牌譜でも選べる）", () => {
    const onChange = vi.fn();
    // 副露（melds）を記録していない牌譜。自動判定だけだと常に門前扱いになってしまう。
    const kifu = kifuWith([
      { winner: "east", from: "south", fu: 30, yaku: [{ name: "混一色", han: 3 }] },
    ]);
    render(<AgariEditor kifu={kifu} dealer="west" onChange={onChange} />);

    // 既定（自動判定=門前）: 混一色は 3飜表示・立直は選択可。
    expect(screen.getByRole("button", { name: /混一色\s*3飜/ })).toBeTruthy();

    // 「鳴きあり」に切り替えると食い下がり（混一色 2飜）になり、門前限定役は選べなくなる。
    fireEvent.click(screen.getByRole("button", { name: "鳴きあり" }));
    expect(screen.getByRole("button", { name: /混一色\s*2飜/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /^立直\s*—/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // 選択済みの役の飜も 2飜 に更新されて保存される。
    const updated = onChange.mock.calls.at(-1)![0] as Agari[];
    expect(updated[0]!.yaku).toEqual([{ name: "混一色", han: 2 }]);
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
