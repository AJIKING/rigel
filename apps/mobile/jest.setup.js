// テスト共通セットアップ。safe-area-context は公式 jest モック（insets=0 の Provider 相当）を使い、
// SafeAreaProvider で包まなくても useSafeAreaInsets を呼ぶコンポーネントを render できるようにする。
// （mock.tsx は default export。変数名を mock* にすると jest.mock ファクトリから参照できる。）
import mockSafeAreaContext from "react-native-safe-area-context/jest/mock";

jest.mock("react-native-safe-area-context", () => mockSafeAreaContext);

// @react-native-firebase/* はネイティブモジュール（RNFBAppModule）が無い jest 環境では
// import 時点で throw する。何もしないスタブにする（lib/crash.test.ts は自前モックで上書きし、
// 画面テストは lib/crash 自体をモックする）。
jest.mock("@react-native-firebase/crashlytics", () => ({
  getCrashlytics: jest.fn(() => ({})),
  recordError: jest.fn(),
  setAttributes: jest.fn(async () => null),
}));

// react-native-purchases（RevenueCat）はネイティブモジュール（dev build 必須）。
// テストでは何もしないスタブにする（各テストは lib/purchases のラッパをモックして使う）。
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(async () => ({})),
    getCustomerInfo: jest.fn(async () => ({ managementURL: null })),
    restorePurchases: jest.fn(async () => ({})),
  },
}));
