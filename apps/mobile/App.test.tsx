// アプリの入口ゲート: サインイン必須にしない。
// 未サインインでもゲスト（guest）ならホームへ入れる（各画面が個別にログイン案内を持つ前提。
// [決定] 2026-07-29 オーナー: 「サインインしないではじめる」導線を置く）。

import { render, screen } from "@testing-library/react-native";
import App from "./App";

jest.mock("./lib/purchases", () => ({ configurePurchases: jest.fn() }));

// ゲートの分岐だけを検証する（中身の画面は各自のテストが持つ）。
jest.mock("./screens/LoginScreen", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return { LoginScreen: () => React.createElement(Text, null, "ログイン画面") };
});
jest.mock("./screens/HomeTabs", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return { HomeTabs: () => React.createElement(Text, null, "ホームタブ") };
});

let mockAuthState: { user: { id: string } | null; guest: boolean; loading: boolean };
jest.mock("./lib/auth", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

describe("App の入口ゲート", () => {
  it("未サインイン・ゲストでもない → ログイン画面", () => {
    mockAuthState = { user: null, guest: false, loading: false };
    render(<App />);
    expect(screen.getByText("ログイン画面")).toBeTruthy();
  });

  it("ゲスト開始済みならサインイン無しでホームへ入れる", () => {
    mockAuthState = { user: null, guest: true, loading: false };
    render(<App />);
    expect(screen.getByText("ホームタブ")).toBeTruthy();
    expect(screen.queryByText("ログイン画面")).toBeNull();
  });

  it("サインイン済みはホーム", () => {
    mockAuthState = { user: { id: "u1" }, guest: false, loading: false };
    render(<App />);
    expect(screen.getByText("ホームタブ")).toBeTruthy();
  });
});
