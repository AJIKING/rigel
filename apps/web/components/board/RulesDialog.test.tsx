import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RULE_PRESETS } from "@rigel/schema";
import { RulesDialog } from "./RulesDialog";

describe("RulesDialog", () => {
  it("プリセット（天鳳）を選んで保存すると天鳳ルールを渡す", () => {
    const onSave = vi.fn();
    render(<RulesDialog rules={RULE_PRESETS.mleague} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "天鳳" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave).toHaveBeenCalledWith(RULE_PRESETS.tenhou);
  });

  it("トグルの変更が保存に反映される（喰いタンをオフ）", () => {
    const onSave = vi.fn();
    render(<RulesDialog rules={RULE_PRESETS.mleague} onClose={() => {}} onSave={onSave} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "喰いタン" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onSave.mock.calls[0][0].kuitan).toBe(false);
  });

  it("キャンセルで onClose を呼ぶ", () => {
    const onClose = vi.fn();
    render(<RulesDialog rules={RULE_PRESETS.mleague} onClose={onClose} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onClose).toHaveBeenCalled();
  });
});
