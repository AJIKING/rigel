import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";
import { SITE_ORIGIN } from "../lib/site";
import { SettingsScreen } from "./SettingsScreen";

// 購入は RevenueCat ラッパ（lib/purchases）経由。ネイティブ SDK のためモックする。
const mockPurchases = {
  purchasePlan: jest.fn(),
  purchasesManagementUrl: jest.fn(async (): Promise<string | null> => null),
};
jest.mock("../lib/purchases", () => ({
  purchasePlan: (...a: unknown[]) => mockPurchases.purchasePlan(...a),
  purchasesManagementUrl: () => mockPurchases.purchasesManagementUrl(),
}));

let mockAuth: {
  token: string | null;
  user: { plan: string; remainingCalls?: number; monthlyCallQuota?: number } | null;
  signOut: jest.Mock;
  refresh: jest.Mock;
  endGuest: jest.Mock;
};
jest.mock("../lib/auth", () => ({ useAuth: () => mockAuth }));

const mockCreatePortal = jest.fn();
jest.mock("../lib/api", () => ({
  createPortal: (...args: unknown[]) => mockCreatePortal(...args),
  deleteAccount: jest.fn(),
  updateProfile: jest.fn(),
}));

describe("SettingsScreen（課金導線）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = {
      token: "t",
      user: { plan: "free" },
      signOut: jest.fn(),
      refresh: jest.fn(),
      endGuest: jest.fn(),
    };
    jest.replaceProperty(Platform, "OS", "ios");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    { label: "Next", plan: "next" as const },
    { label: "Pro", plan: "pro" as const },
  ])(
    "$label を選ぶと RevenueCat 経由で購入し、反映中の文言と /me 再取得を行う",
    async ({ label, plan }) => {
      mockPurchases.purchasePlan.mockResolvedValue("purchased");
      render(<SettingsScreen />);

      fireEvent.press(screen.getByLabelText("プランを変更"));
      fireEvent.press(await screen.findByLabelText(`${label} を選ぶ`));

      await waitFor(() => expect(mockPurchases.purchasePlan).toHaveBeenCalledWith(plan));
      // プラン反映はサーバ側（RevenueCat Webhook）経由のため「反映中」を知らせ /me を再取得。
      expect(await screen.findByText(/プランを反映しています/)).toBeTruthy();
      expect(mockAuth.refresh).toHaveBeenCalled();
    },
  );

  it("Android でも同じく RevenueCat（Play Billing）で購入する（Stripe Checkout は開かない）", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockPurchases.purchasePlan.mockResolvedValue("purchased");

    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    await waitFor(() => expect(mockPurchases.purchasePlan).toHaveBeenCalledWith("next"));
    expect(openURL).not.toHaveBeenCalled();
  });

  it("購入後は plan 反映まで /me をポーリングし、反映されたら完了文言に切り替える", async () => {
    jest.useFakeTimers();
    mockPurchases.purchasePlan.mockResolvedValue("purchased");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(screen.getByLabelText("Next を選ぶ"));
    await act(async () => {}); // purchasePlan の解決を流す

    expect(screen.getByText(/プランを反映しています/)).toBeTruthy();

    // webhook 反映（数秒遅延）を追いかけて /me を再取得し続ける。
    const before = mockAuth.refresh.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(3000);
    });
    expect(mockAuth.refresh.mock.calls.length).toBeGreaterThan(before);

    // /me の plan が変わったら完了文言へ（ポーリングも止まる）。
    mockAuth.user = { plan: "next" };
    screen.rerender(<SettingsScreen />);
    expect(screen.getByText("プランが反映されました")).toBeTruthy();

    jest.useRealTimers();
  });

  it("30秒たっても反映されなければポーリングを打ち切り、その旨を知らせる", async () => {
    jest.useFakeTimers();
    mockPurchases.purchasePlan.mockResolvedValue("purchased");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(screen.getByLabelText("Next を選ぶ"));
    await act(async () => {});

    await act(async () => {
      jest.advanceTimersByTime(30000);
    });
    expect(screen.getByText(/反映に時間がかかっています/)).toBeTruthy();

    // 打ち切り後はポーリングしない。
    const after = mockAuth.refresh.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });
    expect(mockAuth.refresh.mock.calls.length).toBe(after);

    jest.useRealTimers();
  });

  it("購入メッセージは保存ボタンの行ではなく料金プランセクション側の全幅行に出す（レイアウト崩れ防止）", async () => {
    mockPurchases.purchasePlan.mockResolvedValue("purchased");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    const note = await screen.findByText(/プランを反映しています/);
    // 課金メッセージは billing-note（プラン節の独立行）。プロフィール保存行には出さない。
    expect(note.props.testID).toBe("billing-note");
    expect(screen.queryByTestId("profile-note")).toBeNull();
  });

  it("購入キャンセルは何も出さない（ノイズにしない）", async () => {
    mockPurchases.purchasePlan.mockResolvedValue("cancelled");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    await waitFor(() => expect(mockPurchases.purchasePlan).toHaveBeenCalled());
    expect(screen.queryByText(/失敗|反映/)).toBeNull();
    expect(mockAuth.refresh).not.toHaveBeenCalled();
  });

  it("購入失敗はエラー文言を出す", async () => {
    mockPurchases.purchasePlan.mockResolvedValue("failed");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    expect(await screen.findByText("購入に失敗しました")).toBeTruthy();
  });

  it("アプリ内購入が使えない環境（キー未設定）はその旨を知らせる（黙殺しない）", async () => {
    mockPurchases.purchasePlan.mockResolvedValue("unavailable");
    render(<SettingsScreen />);

    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    expect(await screen.findByText("アプリ内購入は現在利用できません")).toBeTruthy();
  });

  it("加入中の「管理」: ストア購読なら RevenueCat の管理URL（OS の購読設定）を開く", async () => {
    mockAuth.user = { plan: "next" };
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockPurchases.purchasesManagementUrl.mockResolvedValue("https://apps.apple.com/subs");

    render(<SettingsScreen />);
    expect(screen.queryByLabelText("プランを変更")).toBeNull(); // 加入中は「管理」のみ
    fireEvent.press(screen.getByLabelText("プランを管理"));

    await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://apps.apple.com/subs"));
    // ストア購読の管理に Stripe ポータルは使わない。
    expect(mockCreatePortal).not.toHaveBeenCalled();
  });

  it("加入中の「管理」: 管理URLが無ければ（web=Stripe 購入）決済ポータルへフォールバック", async () => {
    mockAuth.user = { plan: "next" };
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockPurchases.purchasesManagementUrl.mockResolvedValue(null);
    mockCreatePortal.mockResolvedValue({ ok: true, url: "https://stripe.test/portal" });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("プランを管理"));

    await waitFor(() =>
      expect(mockCreatePortal).toHaveBeenCalledWith("t", { returnUrl: `${SITE_ORIGIN}/settings` }),
    );
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://stripe.test/portal"));
  });

  it("加入中のプランカードは価格ではなく解析枠を表示する（実際の請求額は購入経路で異なるため）", () => {
    mockAuth.user = { plan: "next", remainingCalls: 92, monthlyCallQuota: 100 };
    render(<SettingsScreen />);

    expect(screen.getByText("解析枠 残り 92 / 100（今月）")).toBeTruthy();
    // ストア掲載価格（¥700）は web=Stripe 購入者には誤りなので現在プラン行に出さない。
    expect(screen.queryByText(/¥/)).toBeNull();
  });

  it("free のプランカードは「無料」を表示する（解析枠は出さない）", () => {
    render(<SettingsScreen />);

    expect(screen.getByText("無料")).toBeTruthy();
    expect(screen.queryByText(/解析枠/)).toBeNull();
  });

  it("有料プラン中の削除項目は「削除できません」と明言する（web と同一文言方針）", () => {
    mockAuth.user = { plan: "next" };
    render(<SettingsScreen />);

    expect(screen.getByText("有料プラン契約中は削除できません")).toBeTruthy();
  });

  it("未ログインはプラン変更導線を出さない", () => {
    mockAuth = {
      token: null,
      user: null,
      signOut: jest.fn(),
      refresh: jest.fn(),
      endGuest: jest.fn(),
    };
    render(<SettingsScreen />);

    expect(screen.getByText("設定の保存にはサインインが必要です。")).toBeTruthy();
    expect(screen.queryByLabelText("プランを変更")).toBeNull();
    expect(screen.queryByLabelText("プランを管理")).toBeNull();
  });

  it("未ログイン（ゲスト）にはサインアウト/アカウント削除を出さない（アカウントが無いので無意味）", () => {
    mockAuth = {
      token: null,
      user: null,
      signOut: jest.fn(),
      refresh: jest.fn(),
      endGuest: jest.fn(),
    };
    render(<SettingsScreen />);

    expect(screen.queryByText("サインアウト")).toBeNull();
    expect(screen.queryByText("アカウントを削除")).toBeNull();
  });

  it("ゲスト（未ログイン）にはサインイン導線を出し、押すとログイン画面へ戻す（endGuest）", () => {
    mockAuth = {
      token: null,
      user: null,
      signOut: jest.fn(),
      refresh: jest.fn(),
      endGuest: jest.fn(),
    };
    render(<SettingsScreen />);

    fireEvent.press(screen.getByText("サインインする"));

    expect(mockAuth.endGuest).toHaveBeenCalled();
  });
});
