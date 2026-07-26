// 公開牌譜フィードの絞り込み（新着・人気・今週・お気に入り）のテスト。
// web（KifuListShell の並び替え）と同一の選択肢・挙動に統一する。
// お気に入りはサーバー保存なので、状態はカード（viewerFaved / favoriteCount）が持つ。

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PublicGameCard } from "../lib/api";
import { PublicListScreen } from "./PublicListScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockUsePublicGames = jest.fn();
jest.mock("../lib/use-kifu-data", () => ({
  usePublicGames: () => mockUsePublicGames(),
}));

const mockToggle = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  // 本物と同じ形（apply はカードをそのまま返す＝画面での操作なし）。
  useFavorites: () => ({ apply: (cards: unknown[]) => cards, toggle: mockToggle, error: null }),
}));

function card(
  id: string,
  title: string,
  createdAt: string,
  fav: { favoriteCount?: number; viewerFaved?: boolean } = {},
): PublicGameCard {
  return {
    id,
    ownerId: "u1",
    ownerHandle: "taro",
    ownerName: "太郎",
    title,
    createdAt,
    kyokuCount: 1,
    firstLogId: `${id}-l1`,
    favoriteCount: fav.favoriteCount ?? 0,
    viewerFaved: fav.viewerFaved ?? false,
  };
}

describe("PublicListScreen（公開フィードの絞り込み）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000); // 10日前（今週外）
    mockUsePublicGames.mockReturnValue({
      loading: false,
      sample: false,
      games: [
        // 古いほうがお気に入りされていて、自分も付けている。
        card("g-old", "先週の半荘", old.toISOString(), { favoriteCount: 9, viewerFaved: true }),
        card("g-new", "今日の半荘", now.toISOString(), { favoriteCount: 1 }),
      ],
    });
  });

  it("セグメントは「新着・人気・今週・お気に入り」（web と統一）で、選択に応じて絞り込む", () => {
    render(<PublicListScreen />);

    // 新着（既定）: 両方出る。
    expect(screen.getByText("今日の半荘")).toBeTruthy();
    expect(screen.getByText("先週の半荘")).toBeTruthy();

    // 人気: お気に入りが多い順（古くても上に来る）。
    fireEvent.press(screen.getByText("人気"));
    expect(screen.getByText("先週の半荘")).toBeTruthy();
    expect(screen.getByText("今日の半荘")).toBeTruthy();

    // 今週: 直近7日だけ。
    fireEvent.press(screen.getByText("今週"));
    expect(screen.getByText("今日の半荘")).toBeTruthy();
    expect(screen.queryByText("先週の半荘")).toBeNull();

    // お気に入り: 自分がお気に入りした半荘だけ。
    fireEvent.press(screen.getByText("お気に入り"));
    expect(screen.getByText("先週の半荘")).toBeTruthy();
    expect(screen.queryByText("今日の半荘")).toBeNull();
  });

  it("カードの星がお気に入り状態に配線される（押すと toggle が呼ばれる）", () => {
    render(<PublicListScreen />);

    // 件数つきのラベル（サーバー集計を読み上げにも出す）。
    fireEvent.press(screen.getByLabelText("お気に入りに追加/解除（9件）"));
    expect(mockToggle).toHaveBeenCalledWith("game", expect.objectContaining({ id: "g-old" }));
  });
});

describe("PublicListScreen（取得失敗を空状態に化けさせない）", () => {
  it("失敗したら理由を出す（「まだ公開牌譜がありません」と言わない）", () => {
    mockUsePublicGames.mockReturnValue({
      loading: false,
      sample: false,
      games: [],
      error: "読み込めませんでした。通信状況を確認して、画面を再読み込みしてください。",
    });
    render(<PublicListScreen />);

    expect(screen.getByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/まだ公開牌譜がありません/)).toBeNull();
  });
});
