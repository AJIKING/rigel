import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlanSheet } from "./PlanSheet";

describe("PlanSheet（プラン選択ボトムシート）", () => {
  it("アップグレード先を App Store 価格（30%割増）で一覧する", () => {
    render(<PlanSheet targets={["next", "pro"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    // web 価格 480/1480 ではなく App Store 価格 624/1924 を出す。
    expect(screen.getByText("¥624 / 月")).toBeTruthy();
    expect(screen.getByText("¥1,924 / 月")).toBeTruthy();
    expect(screen.queryByText("¥480 / 月")).toBeNull();
    // App Store 手数料込みである旨の注記。
    expect(screen.getByText(/App Store/)).toBeTruthy();
  });

  it("プランを押すと onSelect にそのプランが渡る", () => {
    const onSelect = jest.fn();
    render(<PlanSheet targets={["next", "pro"]} onSelect={onSelect} onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("Pro を選ぶ"));
    expect(onSelect).toHaveBeenCalledWith("pro");
  });

  it("閉じるで onClose が呼ばれる", () => {
    const onClose = jest.fn();
    render(<PlanSheet targets={["next"]} onSelect={jest.fn()} onClose={onClose} />);
    fireEvent.press(screen.getByText("閉じる"));
    expect(onClose).toHaveBeenCalled();
  });
});
