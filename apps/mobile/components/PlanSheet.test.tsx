import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlanSheet } from "./PlanSheet";

describe("PlanSheet（プラン選択ボトムシート）", () => {
  it("アップグレード先をストア掲載価格（Next ¥700 / Pro ¥1,800）で一覧する", () => {
    render(<PlanSheet targets={["next", "pro"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    // web 価格 480/1480 ではなく、ストア設定と一致する掲載価格を出す（[決定] 2026-07-09）。
    expect(screen.getByText("¥700 / 月")).toBeTruthy();
    expect(screen.getByText("¥1,800 / 月")).toBeTruthy();
    expect(screen.queryByText("¥480 / 月")).toBeNull();
    // ストア手数料込みである旨の注記。
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
