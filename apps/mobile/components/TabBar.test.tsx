import { fireEvent, render, screen } from "@testing-library/react-native";
import { TabBar } from "./TabBar";

describe("TabBar", () => {
  it.each([
    { active: "pub" as const, activeLabel: "牌譜", otherLabel: "特訓" },
    { active: "training" as const, activeLabel: "特訓", otherLabel: "設定" },
  ])(
    "選択中タブ（$activeLabel）だけ accessibilityState.selected=true で読み上げに伝わる",
    ({ active, activeLabel, otherLabel }) => {
      render(<TabBar active={active} onSelect={jest.fn()} />);
      expect(
        screen.getByRole("button", { name: activeLabel }).props.accessibilityState.selected,
      ).toBe(true);
      expect(
        screen.getByRole("button", { name: otherLabel }).props.accessibilityState.selected,
      ).toBe(false);
    },
  );

  it("タブを押すと onSelect にそのタブが渡る", () => {
    const onSelect = jest.fn();
    render(<TabBar active="pub" onSelect={onSelect} />);
    fireEvent.press(screen.getByRole("button", { name: "マイページ" }));
    expect(onSelect).toHaveBeenCalledWith("my");
  });
});
