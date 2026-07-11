// お気に入り（端末ローカル・SecureStore 永続化）のテスト。
// web の use-favorites（localStorage）と同じ API（favs / toggle）を提供する。
// サーバには保存しない（端末ごと）。

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useFavorites } from "./use-favorites";

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

describe("useFavorites（お気に入りの端末ローカル永続化）", () => {
  beforeEach(() => mockStore.clear());

  it("保存済みのお気に入りを起動時に読み込む", async () => {
    mockStore.set("rigel.favs", JSON.stringify(["g1", "g2"]));
    const { result } = renderHook(() => useFavorites());

    await waitFor(() => expect(result.current.favs.has("g1")).toBe(true));
    expect(result.current.favs.has("g2")).toBe(true);
    expect(result.current.favs.has("g3")).toBe(false);
  });

  it("toggle で追加/解除され、SecureStore に永続化される", async () => {
    const { result } = renderHook(() => useFavorites());
    await waitFor(() => expect(result.current.favs.size).toBe(0));

    act(() => result.current.toggle("g1"));
    expect(result.current.favs.has("g1")).toBe(true);
    await waitFor(() => expect(mockStore.get("rigel.favs")).toBe(JSON.stringify(["g1"])));

    act(() => result.current.toggle("g1"));
    expect(result.current.favs.has("g1")).toBe(false);
    await waitFor(() => expect(mockStore.get("rigel.favs")).toBe(JSON.stringify([])));
  });
});
