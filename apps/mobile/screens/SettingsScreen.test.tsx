import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Linking, Platform } from "react-native";
import { IAP_PRODUCT_IDS, IAP_SKUS } from "../lib/iap";
import { SITE_ORIGIN } from "../lib/site";
import { SettingsScreen } from "./SettingsScreen";

// expo-iap はネイティブモジュールのため useIAP を差し替え、購入成立/失敗の
// コールバック（onPurchaseSuccess/onPurchaseError）をテストから起こせるようにする。
type UseIapOptions = {
  onPurchaseSuccess?: (purchase: { purchaseToken?: string }) => void;
  onPurchaseError?: (e: { code?: string }) => void;
};
const mockIap = {
  options: undefined as UseIapOptions | undefined,
  connected: true,
  fetchProducts: jest.fn(),
  requestPurchase: jest.fn(),
  finishTransaction: jest.fn(),
};
jest.mock("expo-iap", () => ({
  useIAP: (options: UseIapOptions) => {
    mockIap.options = options;
    return {
      connected: mockIap.connected,
      fetchProducts: mockIap.fetchProducts,
      requestPurchase: mockIap.requestPurchase,
      finishTransaction: mockIap.finishTransaction,
    };
  },
}));

let mockAuth: {
  token: string | null;
  user: { plan: string } | null;
  signOut: jest.Mock;
  refresh: jest.Mock;
};
jest.mock("../lib/auth", () => ({ useAuth: () => mockAuth }));

const mockRedeem = jest.fn();
const mockCreateCheckout = jest.fn();
const mockCreatePortal = jest.fn();
jest.mock("../lib/api", () => ({
  createCheckout: (...args: unknown[]) => mockCreateCheckout(...args),
  createPortal: (...args: unknown[]) => mockCreatePortal(...args),
  deleteAccount: jest.fn(),
  redeemAppStorePurchase: (...args: unknown[]) => mockRedeem(...args),
  updateProfile: jest.fn(),
}));

describe("SettingsScreen（課金導線）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIap.options = undefined;
    mockAuth = { token: "t", user: { plan: "free" }, signOut: jest.fn(), refresh: jest.fn() };
    // jest-expo の既定に依存せず iOS を明示（IAP 分岐の前提）。
    jest.replaceProperty(Platform, "OS", "ios");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("接続済みなら App Store の商品ID一覧（IAP_SKUS）で購読商品を取得する", () => {
    render(<SettingsScreen />);
    expect(mockIap.fetchProducts).toHaveBeenCalledWith({ skus: IAP_SKUS, type: "subs" });
  });

  it.each([
    { label: "Next", plan: "next" as const },
    { label: "Pro", plan: "pro" as const },
  ])(
    "iOS: $label を選ぶと商品ID $plan（IAP_PRODUCT_IDS）で購読購入をリクエストする",
    async ({ label, plan }) => {
      render(<SettingsScreen />);

      fireEvent.press(screen.getByLabelText("プランを変更"));
      fireEvent.press(await screen.findByLabelText(`${label} を選ぶ`));

      await waitFor(() =>
        expect(mockIap.requestPurchase).toHaveBeenCalledWith({
          request: {
            ios: {
              sku: IAP_PRODUCT_IDS[plan],
              // api の検証が通るまでトランザクションを自動で閉じない。
              andDangerouslyFinishTransactionAutomatically: false,
            },
          },
          type: "subs",
        }),
      );
      // iOS は IAP のみ（Stripe Checkout を作らない）。
      expect(mockCreateCheckout).not.toHaveBeenCalled();
    },
  );

  it("IAP 購入成立: JWS を検証APIへ渡し、成功でトランザクション完了・プラン表示が更新される", async () => {
    mockRedeem.mockResolvedValue({ ok: true, plan: "next" });
    // refresh（/me 再取得）でプランが反映される想定を再現。
    // 実装では refresh → setUser がコンテキスト経由の再レンダーを起こすが、
    // モックでは起きないため、反映後の表示は rerender で検証する。
    mockAuth.refresh.mockImplementation(() => {
      mockAuth.user = { plan: "next" };
      return Promise.resolve();
    });
    render(<SettingsScreen />);
    expect(screen.getByText("Free")).toBeTruthy();

    await act(async () => {
      mockIap.options?.onPurchaseSuccess?.({ purchaseToken: "signed-jws" });
    });

    expect(mockRedeem).toHaveBeenCalledWith("t", { jws: "signed-jws" });
    expect(await screen.findByText("プランを Next に変更しました")).toBeTruthy();
    expect(mockIap.finishTransaction).toHaveBeenCalledWith({
      purchase: { purchaseToken: "signed-jws" },
      isConsumable: false,
    });
    expect(mockAuth.refresh).toHaveBeenCalled();

    // refresh 反映後（auth コンテキスト更新後）の再レンダーでプラン表示が Next になる。
    screen.rerender(<SettingsScreen />);
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.queryByText("Free")).toBeNull();
  });

  it.each([{ status: 410 }, { status: 400 }])(
    "IAP 検証失敗（$status）: エラー文言を出し、トランザクションは閉じず、プラン表示は変わらない",
    async ({ status }) => {
      mockRedeem.mockResolvedValue({ ok: false, status });
      render(<SettingsScreen />);

      await act(async () => {
        mockIap.options?.onPurchaseSuccess?.({ purchaseToken: "expired-jws" });
      });

      expect(
        await screen.findByText("購入の検証に失敗しました。時間をおいて再度お試しください"),
      ).toBeTruthy();
      // 未 finish のまま残す（次回の onPurchaseSuccess で再試行できる）。
      expect(mockIap.finishTransaction).not.toHaveBeenCalled();
      expect(mockAuth.refresh).not.toHaveBeenCalled();
      expect(screen.getByText("Free")).toBeTruthy();
    },
  );

  it.each([
    { code: "E_USER_CANCELLED", name: "キャンセル", shown: false },
    { code: "E_UNKNOWN", name: "その他エラー", shown: true },
  ])("IAP 購入エラー（$name）: キャンセル以外だけ文言を出す", ({ code, shown }) => {
    render(<SettingsScreen />);

    act(() => {
      mockIap.options?.onPurchaseError?.({ code });
    });

    if (shown) expect(screen.getByText("購入に失敗しました")).toBeTruthy();
    else expect(screen.queryByText("購入に失敗しました")).toBeNull();
  });

  it("iOS 以外はプラン選択で Stripe Checkout を開く（戻り先は SITE_ORIGIN の設定ページ）", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockCreateCheckout.mockResolvedValue({ ok: true, url: "https://stripe.test/pay" });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    await waitFor(() =>
      expect(mockCreateCheckout).toHaveBeenCalledWith("t", {
        plan: "next",
        successUrl: `${SITE_ORIGIN}/settings`,
        cancelUrl: `${SITE_ORIGIN}/settings`,
      }),
    );
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://stripe.test/pay"));
    expect(mockIap.requestPurchase).not.toHaveBeenCalled();
  });

  it("Checkout が失敗（501）するとユーザー向け文言を出し、外部URLを開かない", async () => {
    jest.replaceProperty(Platform, "OS", "android");
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockCreateCheckout.mockResolvedValue({ ok: false, status: 501 });

    render(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText("プランを変更"));
    fireEvent.press(await screen.findByLabelText("Next を選ぶ"));

    expect(await screen.findByText("課金は準備中です。")).toBeTruthy();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("加入中（next）は「管理」から決済ポータルを開く（戻り先は SITE_ORIGIN の設定ページ）", async () => {
    mockAuth.user = { plan: "next" };
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined as never);
    mockCreatePortal.mockResolvedValue({ ok: true, url: "https://stripe.test/portal" });

    render(<SettingsScreen />);
    // 現在プランの表示と、加入中は「変更」でなく「管理」導線になること。
    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.queryByLabelText("プランを変更")).toBeNull();
    fireEvent.press(screen.getByLabelText("プランを管理"));

    await waitFor(() =>
      expect(mockCreatePortal).toHaveBeenCalledWith("t", { returnUrl: `${SITE_ORIGIN}/settings` }),
    );
    await waitFor(() => expect(openURL).toHaveBeenCalledWith("https://stripe.test/portal"));
    // ポータル一本化（Checkout の作り直し＝二重課金をしない）。
    expect(mockCreateCheckout).not.toHaveBeenCalled();
  });

  it("未ログインはプラン変更導線を出さない", () => {
    mockAuth = { token: null, user: null, signOut: jest.fn(), refresh: jest.fn() };
    render(<SettingsScreen />);

    expect(screen.getByText("設定の保存にはログインが必要です。")).toBeTruthy();
    expect(screen.queryByLabelText("プランを変更")).toBeNull();
    expect(screen.queryByLabelText("プランを管理")).toBeNull();
  });
});
