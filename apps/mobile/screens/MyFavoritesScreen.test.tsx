// マイページ「お気に入り」セグメントのテスト。
// 牌譜と何切るを1か所に並べ、種別で絞れて、自分のものと他人のもので開く先が変わることを固定する。

import type { FavoriteGameCard, FavoriteProblemCard } from "@rigel/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { makePost } from "./problem-test-helpers";
import { MyFavoritesScreen } from "./MyFavoritesScreen";

const mockNavigate = jest.fn();
// useFocusEffect は本物と同じく「渡された（useCallback 済みの）関数が変わったときだけ」走らせる。
// 毎レンダー呼ぶモックにすると、状態更新→再レンダー→再取得の無限ループになる。
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]),
  };
});

jest.mock("../lib/auth", () => ({ useAuth: () => ({ token: "t" }) }));

const mockListMyFavorites = jest.fn();
jest.mock("../lib/api", () => ({
  listMyFavorites: (...args: unknown[]) => mockListMyFavorites(...args),
}));

const mockToggleFav = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  useFavorites: () => ({
    apply: (cards: unknown[]) => cards,
    toggle: mockToggleFav,
    error: null,
  }),
}));

function game(id: string, over: Partial<FavoriteGameCard> = {}): FavoriteGameCard {
  return {
    id,
    ownerId: "other",
    ownerHandle: "taro",
    ownerName: "太郎",
    title: `半荘${id}`,
    createdAt: "2026-07-20T00:00:00.000Z",
    kyokuCount: 4,
    firstLogId: `${id}-l1`,
    favoriteCount: 1,
    viewerFaved: true,
    mine: false,
    ...over,
  };
}

function problem(id: string, over: Partial<FavoriteProblemCard> = {}): FavoriteProblemCard {
  return {
    ...makePost({ id, title: `問題${id}`, favoriteCount: 1, viewerFaved: true }),
    mine: false,
    ownerHandle: "taro",
    ownerName: "太郎",
    ...over,
  };
}

function setFavorites(games: FavoriteGameCard[], problems: FavoriteProblemCard[]) {
  mockListMyFavorites.mockResolvedValue({ games, problems });
}

describe("MyFavoritesScreen（マイページ お気に入り）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("牌譜と何切るを1か所に並べる", async () => {
    setFavorites([game("g1")], [problem("p1")]);
    render(<MyFavoritesScreen />);

    expect(await screen.findByText("半荘g1")).toBeTruthy();
    expect(screen.getByText("問題p1")).toBeTruthy();
  });

  it("種別で絞り込める（牌譜だけ / 何切るだけ）", async () => {
    setFavorites([game("g1")], [problem("p1")]);
    render(<MyFavoritesScreen />);
    await screen.findByText("半荘g1");

    // 「牌譜」はカードのバッジにも出るので、セグメント（button ロール）を指名する。
    fireEvent.press(screen.getByRole("button", { name: "牌譜" }));
    expect(screen.queryByText("問題p1")).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "何切る" }));
    expect(screen.queryByText("半荘g1")).toBeNull();
    expect(screen.getByText("問題p1")).toBeTruthy();
  });

  it("自分の半荘は半荘詳細、他人の半荘は公開ビューアへ開く", async () => {
    setFavorites([game("g1"), game("g2", { mine: true, ownerId: "me" })], []);
    render(<MyFavoritesScreen />);
    await screen.findByText("半荘g1");

    fireEvent.press(screen.getByText("半荘g1"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicGame", { gameId: "g1", logId: "g1-l1" });

    fireEvent.press(screen.getByText("半荘g2"));
    expect(mockNavigate).toHaveBeenCalledWith("GameDetail", { gameId: "g2" });
  });

  it("★を外すとサーバー保存の toggle が呼ばれる", async () => {
    setFavorites([game("g1")], []);
    render(<MyFavoritesScreen />);
    await screen.findByText("半荘g1");

    fireEvent.press(screen.getByLabelText("お気に入りに追加/解除（1件）"));
    await waitFor(() =>
      expect(mockToggleFav).toHaveBeenCalledWith("game", expect.objectContaining({ id: "g1" })),
    );
  });

  it("1件も無ければ★の付け方を案内する", async () => {
    setFavorites([], []);
    render(<MyFavoritesScreen />);

    expect(
      await screen.findByText("まだお気に入りがありません。カードの★から追加できます。"),
    ).toBeTruthy();
  });
});

describe("MyFavoritesScreen（取得失敗を空状態に化けさせない）", () => {
  it("読み込みに失敗したら、その旨を出す（「まだお気に入りがありません」と言わない）", async () => {
    mockListMyFavorites.mockRejectedValue(new Error("network"));
    render(<MyFavoritesScreen />);

    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/まだお気に入りがありません/)).toBeNull();
  });
});
