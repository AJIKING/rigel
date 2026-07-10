// 認証と RevenueCat の紐づけ（横串一元管理の起点）のテスト。
// ログイン成立（新規/起動復元）で logInPurchases(userId)、ログアウトで logOutPurchases が
// 呼ばれることを固定する（これが無いと購入が別ユーザー扱いになり「どこで買っても解放」が壊れる）。

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AppState, Pressable, Text } from "react-native";
import { AuthProvider, useAuth } from "./auth";

const mockStore = new Map<string, string>();
jest.mock("expo-secure-store", () => ({
  getItemAsync: (k: string) => Promise.resolve(mockStore.get(k) ?? null),
  setItemAsync: (k: string, v: string) => {
    mockStore.set(k, v);
    return Promise.resolve();
  },
  deleteItemAsync: (k: string) => {
    mockStore.delete(k);
    return Promise.resolve();
  },
}));

const mockAuthWithGoogle = jest.fn();
const mockFetchMe = jest.fn();
jest.mock("./api", () => ({
  authWithGoogle: (...a: unknown[]) => mockAuthWithGoogle(...a),
  fetchMe: (...a: unknown[]) => mockFetchMe(...a),
}));

const mockLogIn = jest.fn((_userId: string) => Promise.resolve());
const mockLogOut = jest.fn(() => Promise.resolve());
jest.mock("./purchases", () => ({
  logInPurchases: (userId: string) => mockLogIn(userId),
  logOutPurchases: () => mockLogOut(),
}));

/** useAuth を叩くためのプローブ。 */
function Probe() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  return (
    <>
      <Text>{loading ? "loading" : (user?.id ?? "none")}</Text>
      <Pressable accessibilityLabel="login" onPress={() => void signInWithGoogle("idtok")} />
      <Pressable accessibilityLabel="logout" onPress={() => signOut()} />
    </>
  );
}

describe("AuthProvider と RevenueCat の紐づけ", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
  });

  it("Google ログイン成立で RevenueCat に userId を紐づける", async () => {
    mockAuthWithGoogle.mockResolvedValue({ sessionToken: "tok", user: { id: "u1" } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("none");

    fireEvent.press(screen.getByLabelText("login"));

    expect(await screen.findByText("u1")).toBeTruthy();
    expect(mockLogIn).toHaveBeenCalledWith("u1");
  });

  it("起動時のセッション復元でも RevenueCat に userId を紐づける", async () => {
    mockStore.set("rigel.session", "saved-tok");
    mockFetchMe.mockResolvedValue({ id: "u2" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("u2")).toBeTruthy();
    await waitFor(() => expect(mockLogIn).toHaveBeenCalledWith("u2"));
  });

  it("フォアグラウンド復帰で /me を再取得する（web購入・失効など外で起きた plan 変化を拾う）", async () => {
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
      listeners.push(handler as (s: string) => void);
      return { remove: jest.fn() } as never;
    });
    mockStore.set("rigel.session", "saved-tok");
    mockFetchMe.mockResolvedValue({ id: "u2" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("u2");

    mockFetchMe.mockClear();
    await act(async () => {
      listeners.forEach((l) => l("active"));
    });
    expect(mockFetchMe).toHaveBeenCalledWith("saved-tok");

    jest.restoreAllMocks();
  });

  it("ログアウトで RevenueCat の紐づけを解除する", async () => {
    mockStore.set("rigel.session", "saved-tok");
    mockFetchMe.mockResolvedValue({ id: "u2" });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await screen.findByText("u2");

    fireEvent.press(screen.getByLabelText("logout"));

    expect(await screen.findByText("none")).toBeTruthy();
    expect(mockLogOut).toHaveBeenCalled();
  });
});
