import { RULE_PRESETS, RulesSchema, type Rules } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RulesSheet } from "./RulesSheet";

const defaults: Rules = RulesSchema.parse({});

describe("RulesSheet（ルール設定シート）", () => {
  it("プリセット（天鳳）を選んで保存するとそのルールが返る", () => {
    const onSave = jest.fn();
    render(<RulesSheet rules={defaults} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.press(screen.getByText("天鳳"));
    fireEvent.press(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledWith(RULE_PRESETS.tenhou);
  });

  it("トグル（喰いタン）を切り替えて保存できる", () => {
    const onSave = jest.fn();
    render(<RulesSheet rules={defaults} onSave={onSave} onClose={jest.fn()} />);
    // 既定 kuitan=true → タップで false。
    fireEvent.press(screen.getByLabelText("喰いタン"));
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![0].kuitan).toBe(false);
  });

  it("セグメント（赤ドラ）を各2枚にして保存できる", () => {
    const onSave = jest.fn();
    render(<RulesSheet rules={defaults} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.press(screen.getByText("各2枚"));
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![0].aka).toBe("2");
  });

  it("閉じるで onClose が呼ばれる", () => {
    const onClose = jest.fn();
    render(<RulesSheet rules={defaults} onSave={jest.fn()} onClose={onClose} />);
    fireEvent.press(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalled();
  });
});
