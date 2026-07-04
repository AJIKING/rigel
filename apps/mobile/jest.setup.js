// テスト共通セットアップ。safe-area-context は公式 jest モック（insets=0 の Provider 相当）を使い、
// SafeAreaProvider で包まなくても useSafeAreaInsets を呼ぶコンポーネントを render できるようにする。
// （mock.tsx は default export。変数名を mock* にすると jest.mock ファクトリから参照できる。）
import mockSafeAreaContext from "react-native-safe-area-context/jest/mock";

jest.mock("react-native-safe-area-context", () => mockSafeAreaContext);

// expo-iap はネイティブモジュール（dev build 必須）。テストでは未接続のスタブにする。
jest.mock("expo-iap", () => ({
  useIAP: () => ({
    connected: false,
    subscriptions: [],
    fetchProducts: jest.fn(),
    requestPurchase: jest.fn(),
    finishTransaction: jest.fn(),
  }),
}));
