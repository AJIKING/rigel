// テスト共通セットアップ。safe-area-context は公式 jest モック（insets=0 の Provider 相当）を使い、
// SafeAreaProvider で包まなくても useSafeAreaInsets を呼ぶコンポーネントを render できるようにする。
// （mock.tsx は default export。変数名を mock* にすると jest.mock ファクトリから参照できる。）
import mockSafeAreaContext from "react-native-safe-area-context/jest/mock";

jest.mock("react-native-safe-area-context", () => mockSafeAreaContext);

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
  },
}));
