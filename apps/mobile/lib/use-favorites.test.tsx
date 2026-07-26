// お気に入り（サーバー保存。[決定] 2026-07-26）のテスト。
// カードが持つ viewerFaved / favoriteCount に、この画面での操作を重ねて解決する。
// 端末ローカル（SecureStore）時代の保存値は初回ログイン時にサーバーへ移してから消す。

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { resetFavoriteMigrationForTest, useFavorites, type FavoriteCard } from "./use-favorites";

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

// jest.mock のファクトリからは mock 接頭辞の変数だけ参照できる。
const mockSetFavorite = jest.fn();
jest.mock("./api", () => ({ setFavorite: (...args: unknown[]) => mockSetFavorite(...args) }));

let mockToken: string | null = "t";
jest.mock("./auth", () => ({ useAuth: () => ({ token: mockToken }) }));

function card(over: Partial<FavoriteCard> = {}): FavoriteCard {
  return { id: "g1", favoriteCount: 3, viewerFaved: false, ...over };
}

/** 「旧データの移行は1回だけ」のフラグを戻してからフックを描く。 */
function freshHook() {
  resetFavoriteMigrationForTest();
  return renderHook(() => useFavorites());
}

beforeEach(() => {
  mockStore.clear();
  mockToken = "t";
  mockSetFavorite.mockReset().mockResolvedValue({ ok: true, faved: true, favoriteCount: 4 });
});

describe("useFavorites（サーバー保存のお気に入り）", () => {
  it("操作していないカードはサーバーの値のまま返す", () => {
    const { result } = freshHook();
    expect(result.current.apply([card()])).toEqual([card()]);
  });

  it("toggle はサーバーへ保存し、★と件数を取り直さずに反映する（楽観更新）", async () => {
    const { result } = freshHook();
    act(() => result.current.toggle("game", card()));

    expect(result.current.apply([card()])).toEqual([
      { id: "g1", favoriteCount: 4, viewerFaved: true },
    ]);
    await waitFor(() => expect(mockSetFavorite).toHaveBeenCalledWith("t", "game", "g1", true));
  });

  it("付いているものを toggle すると外れ、件数が1減る", async () => {
    const { result } = freshHook();
    const faved = card({ viewerFaved: true, favoriteCount: 3 });
    act(() => result.current.toggle("game", faved));

    expect(result.current.apply([faved])).toEqual([
      { id: "g1", favoriteCount: 2, viewerFaved: false },
    ]);
    await waitFor(() => expect(mockSetFavorite).toHaveBeenCalledWith("t", "game", "g1", false));
  });

  it("サーバーが失敗したら押す前に戻し、理由を出す（黙って付いたことにしない）", async () => {
    mockSetFavorite.mockResolvedValue({ ok: false, status: 404 });
    const { result } = freshHook();
    act(() => result.current.toggle("game", card()));

    await waitFor(() => expect(result.current.error).toBe("お気に入りを更新できませんでした。"));
    expect(result.current.apply([card()])).toEqual([card()]);
  });

  it("未ログインでは保存を試みず、ログインが必要だと伝える", () => {
    mockToken = null;
    const { result } = freshHook();
    act(() => result.current.toggle("game", card()));

    expect(mockSetFavorite).not.toHaveBeenCalled();
    expect(result.current.error).toBe("お気に入りにはログインが必要です。");
  });

  it("端末ローカルの旧お気に入りをサーバーへ移し、保存値を消す（種別が分からないので両方に試す）", async () => {
    mockStore.set("rigel.favs", JSON.stringify(["x1"]));
    freshHook();

    await waitFor(() => expect(mockStore.has("rigel.favs")).toBe(false));
    expect(mockSetFavorite).toHaveBeenCalledWith("t", "game", "x1", true);
    expect(mockSetFavorite).toHaveBeenCalledWith("t", "problem", "x1", true);
  });
});
