// RevenueCat SDK ラッパの単体テスト。SDK はネイティブモジュールのためモックする。
// キー未設定（Expo Go / 開発）では全操作が安全に無効化されることも境界として固定する。

import { IAP_PRODUCT_IDS } from "./iap";

// ESM import はモジュール本体より先に評価されるため、モック実体はファクトリ内で作り、
// mock 済みモジュールの import から取り出す（外側変数の参照は初期化順で壊れる）。
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(async () => ({})),
    getCustomerInfo: jest.fn(),
    restorePurchases: jest.fn(async () => ({})),
  },
}));
// SDK キーの取得はモジュールごと差し替える（EXPO_PUBLIC_* は babel が静的展開する
// ため、テスト実行時の process.env 代入では切り替えられない）。
jest.mock("./purchases-keys", () => ({ revenueCatApiKey: jest.fn(() => "appl_test") }));

// エラー計測（Crashlytics）はモック（課金の失敗が記録されることを検証する）。
const mockTrackError = jest.fn();
jest.mock("./crash", () => ({ trackError: (...a: unknown[]) => mockTrackError(...a) }));

import Purchases from "react-native-purchases";
import { revenueCatApiKey } from "./purchases-keys";
import {
  configurePurchases,
  logInPurchases,
  logOutPurchases,
  purchasePlan,
  purchasesEnabled,
  purchasesManagementUrl,
  restorePurchases,
} from "./purchases";

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockSdk = Purchases as any as {
  configure: jest.Mock;
  logIn: jest.Mock;
  logOut: jest.Mock;
  getOfferings: jest.Mock;
  purchasePackage: jest.Mock;
  getCustomerInfo: jest.Mock;
  restorePurchases: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-explicit-any */
const mockApiKey = revenueCatApiKey as jest.Mock;

/** offerings に指定の商品IDのパッケージを持たせる。 */
function offeringsWith(productIds: string[]) {
  return {
    current: {
      availablePackages: productIds.map((id) => ({ product: { identifier: id } })),
    },
  };
}

describe("purchases（RevenueCat ラッパ）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiKey.mockReturnValue("appl_test");
  });

  it("purchasePlan は offerings から商品IDが一致するパッケージを購入する", async () => {
    mockSdk.getOfferings.mockResolvedValue(
      offeringsWith([IAP_PRODUCT_IDS.next, IAP_PRODUCT_IDS.pro]),
    );
    expect(await purchasePlan("pro")).toBe("purchased");
    expect(mockSdk.purchasePackage).toHaveBeenCalledWith({
      product: { identifier: IAP_PRODUCT_IDS.pro },
    });
  });

  it("purchasePlan: Play は identifier が「サブスクID:基本プランID」形式でも一致する（iOS は素のID）", async () => {
    // RevenueCat v6+ の Google 商品は `rigel.next.monthly:rigel-next-monthly` の形式で返る。
    mockSdk.getOfferings.mockResolvedValue(
      offeringsWith([
        `${IAP_PRODUCT_IDS.next}:rigel-next-monthly`,
        `${IAP_PRODUCT_IDS.pro}:rigel-pro-monthly`,
      ]),
    );
    expect(await purchasePlan("next")).toBe("purchased");
    expect(mockSdk.purchasePackage).toHaveBeenCalledWith({
      product: { identifier: `${IAP_PRODUCT_IDS.next}:rigel-next-monthly` },
    });
  });

  it("purchasePlan: ユーザーキャンセルは cancelled、該当パッケージ無し/例外は failed", async () => {
    mockSdk.getOfferings.mockResolvedValue(offeringsWith([IAP_PRODUCT_IDS.next]));
    mockSdk.purchasePackage.mockRejectedValueOnce({ userCancelled: true });
    expect(await purchasePlan("next")).toBe("cancelled");
    // キャンセルはユーザーの意思＝エラーとして記録しない（ダッシュボードを汚さない）。
    expect(mockTrackError).not.toHaveBeenCalled();

    expect(await purchasePlan("pro")).toBe("failed"); // offerings に pro が無い

    mockSdk.getOfferings.mockRejectedValueOnce(new Error("network"));
    expect(await purchasePlan("next")).toBe("failed");
    // 例外による失敗は Crashlytics に記録する（screen/op の固定語彙つき）。
    expect(mockTrackError).toHaveBeenCalledWith(expect.any(Error), {
      screen: "settings",
      op: "purchase",
    });
  });

  it("logIn/logOut は SDK へ委譲し、失敗しても例外を外へ漏らさない（認証を壊さない・Crashlytics には記録）", async () => {
    await logInPurchases("u1");
    expect(mockSdk.logIn).toHaveBeenCalledWith("u1");

    mockSdk.logOut.mockRejectedValueOnce(new Error("anonymous"));
    await expect(logOutPurchases()).resolves.toBeUndefined();
    expect(mockTrackError).toHaveBeenCalledWith(expect.any(Error), {
      screen: "login",
      op: "purchases_logout",
    });

    mockSdk.logIn.mockRejectedValueOnce(new Error("network"));
    await logInPurchases("u2");
    expect(mockTrackError).toHaveBeenCalledWith(expect.any(Error), {
      screen: "login",
      op: "purchases_login",
    });
  });

  it("purchasesManagementUrl は customerInfo の managementURL を返す（無ければ null）", async () => {
    mockSdk.getCustomerInfo.mockResolvedValue({ managementURL: "https://apps.apple.com/subs" });
    expect(await purchasesManagementUrl()).toBe("https://apps.apple.com/subs");
    mockSdk.getCustomerInfo.mockResolvedValue({ managementURL: null });
    expect(await purchasesManagementUrl()).toBeNull();
  });

  it("configurePurchases は1回だけ SDK を初期化する", () => {
    configurePurchases();
    configurePurchases();
    expect(mockSdk.configure).toHaveBeenCalledTimes(1);
  });

  it("restorePurchases は SDK の復元を呼んで restored を返す（機種変更・再インストールの取り戻し。App Store 審査要件）", async () => {
    expect(await restorePurchases()).toBe("restored");
    expect(mockSdk.restorePurchases).toHaveBeenCalled();
  });

  it("restorePurchases: 例外は failed（Crashlytics に記録）・キー未設定は unavailable（SDK を触らない）", async () => {
    mockSdk.restorePurchases.mockRejectedValueOnce(new Error("network"));
    expect(await restorePurchases()).toBe("failed");
    expect(mockTrackError).toHaveBeenCalledWith(expect.any(Error), {
      screen: "settings",
      op: "restore_purchases",
    });

    mockApiKey.mockReturnValue("");
    expect(await restorePurchases()).toBe("unavailable");
    expect(mockSdk.restorePurchases).toHaveBeenCalledTimes(1); // 未設定時は呼ばれない
  });

  it("キー未設定（Expo Go / 開発）では無効: 購入は unavailable・SDK を触らない", async () => {
    mockApiKey.mockReturnValue("");
    expect(purchasesEnabled()).toBe(false);
    expect(await purchasePlan("next")).toBe("unavailable");
    await logInPurchases("u1");
    expect(await purchasesManagementUrl()).toBeNull();
    expect(mockSdk.getOfferings).not.toHaveBeenCalled();
    expect(mockSdk.logIn).not.toHaveBeenCalled();
  });
});
