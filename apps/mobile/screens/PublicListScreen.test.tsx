// 公開牌譜フィードの絞り込み（新着・今週・お気に入り）のテスト。
// web（KifuListShell の並び替え）と同一の選択肢・挙動に統一する。

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

let mockFavs: Set<string>;
const mockToggle = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  useFavorites: () => ({ favs: mockFavs, toggle: mockToggle }),
}));

function card(id: string, title: string, createdAt: string): PublicGameCard {
  return {
    id,
    ownerId: "u1",
    ownerHandle: "taro",
    ownerName: "太郎",
    title,
    createdAt,
    kyokuCount: 1,
    firstLogId: `${id}-l1`,
  };
}

describe("PublicListScreen（公開フィードの絞り込み）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFavs = new Set(["g-old"]);
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000); // 10日前（今週外）
    mockUsePublicGames.mockReturnValue({
      loading: false,
      sample: false,
      games: [
        card("g-old", "先週の半荘", old.toISOString()),
        card("g-new", "今日の半荘", now.toISOString()),
      ],
    });
  });

  it("セグメントは「新着・今週・お気に入り」（web と統一）で、選択に応じて絞り込む", () => {
    render(<PublicListScreen />);

    // 新着（既定）: 両方出る。
    expect(screen.getByText("今日の半荘")).toBeTruthy();
    expect(screen.getByText("先週の半荘")).toBeTruthy();

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

    const stars = screen.getAllByLabelText("お気に入りに追加/解除");
    fireEvent.press(stars[0]!);
    expect(mockToggle).toHaveBeenCalled();
  });
});
