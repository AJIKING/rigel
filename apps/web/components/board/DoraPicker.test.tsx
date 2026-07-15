import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DoraPicker } from "./DoraPicker";

describe("DoraPicker", () => {
  it("開いて牌を選ぶと onPick が呼ばれる（getBoundingClientRect で落ちない）", () => {
    const onPick = vi.fn();
    render(<DoraPicker value={null} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "ドラ表示牌を選ぶ" }));
    // ポップアップが開く
    expect(screen.getByRole("dialog", { name: "ドラ表示牌を選ぶ" })).toBeTruthy();
    fireEvent.click(screen.getByAltText("1萬")); // 萬子タブの先頭 = 1m
    expect(onPick).toHaveBeenCalledWith("1m");
  });

  it("値があるとき「クリア（なし）」で onPick(null) が呼ばれる（取り消し）", () => {
    const onPick = vi.fn();
    render(<DoraPicker value="3m" onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "ドラ表示牌を選ぶ" }));
    fireEvent.click(screen.getByText("クリア（なし）"));
    expect(onPick).toHaveBeenCalledWith(null);
  });

  it("未設定のときはクリアボタンを出さない", () => {
    render(<DoraPicker value={null} onPick={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "ドラ表示牌を選ぶ" }));
    expect(screen.queryByText("クリア（なし）")).toBeNull();
  });
});
