import { fireEvent, render, screen } from "@testing-library/react-native";
import { SITE_ORIGIN } from "../lib/site";
import { PlanSheet } from "./PlanSheet";

const mockOpenBrowser = jest.fn();
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...a: unknown[]) => mockOpenBrowser(...(a as [string])),
}));

describe("PlanSheet（プラン選択ボトムシート）", () => {
  it("アップグレード先をストア掲載価格（Next ¥700 / Pro ¥1,800）で一覧する", () => {
    render(<PlanSheet targets={["next", "pro"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    // web 価格 480/1480 ではなく、ストア設定と一致する掲載価格を出す（[決定] 2026-07-09）。
    expect(screen.getByText("¥700 / 月")).toBeTruthy();
    expect(screen.getByText("¥1,800 / 月")).toBeTruthy();
    expect(screen.queryByText("¥480 / 月")).toBeNull();
  });

  it("自動更新の仕組みを明記し、ストア固有の文言（App Store・手数料）は出さない（審査 3.1.2 / Android 共用）", () => {
    render(<PlanSheet targets={["next", "pro"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    // 期間（1か月）と自動更新・解約方法の明示（App Store 3.1.2 の必須項目）。
    expect(screen.getByText(/1か月ごとの自動更新/)).toBeTruthy();
    expect(screen.getByText(/解約はいつでも/)).toBeTruthy();
    expect(screen.queryByText(/App Store/)).toBeNull();
    expect(screen.queryByText(/手数料/)).toBeNull();
  });

  it("利用規約・プライバシーポリシーへのリンクを購入画面に出す（審査 3.1.2）", () => {
    render(<PlanSheet targets={["next"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    fireEvent.press(screen.getByText("利用規約"));
    expect(mockOpenBrowser).toHaveBeenCalledWith(`${SITE_ORIGIN}/terms`);
    fireEvent.press(screen.getByText("プライバシーポリシー"));
    expect(mockOpenBrowser).toHaveBeenCalledWith(`${SITE_ORIGIN}/privacy`);
  });

  it("提供内容に特訓の行が出る（有料=無制限。PLAN_FEATURES 経由の自動反映）", () => {
    render(<PlanSheet targets={["next", "pro"]} onSelect={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getAllByText("特訓 無制限")).toHaveLength(2); // Next / Pro
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
