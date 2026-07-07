import { fireEvent, render, screen } from "@testing-library/react-native";
import type { MyGameCard } from "../lib/api";
import { MyListScreen } from "./MyListScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // フォーカス時の再取得はこのテストの関心外（no-op）。
  useFocusEffect: () => {},
}));

jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: "t", user: { plan: "free" } }),
}));

const mockUseMyGames = jest.fn();
jest.mock("../lib/use-kifu-data", () => ({
  useMyGames: (...args: unknown[]) => mockUseMyGames(...args),
}));

jest.mock("../lib/api", () => ({
  deleteGame: jest.fn(),
}));

function makeGame(overrides: Partial<MyGameCard> = {}): MyGameCard {
  return {
    id: "g1",
    title: "東風戦",
    createdAt: "2026-07-01T00:00:00.000Z",
    kyokuCount: 4,
    publicCount: 0,
    draftCount: 0,
    ...overrides,
  };
}

function setGames(games: MyGameCard[]) {
  mockUseMyGames.mockReturnValue({ loading: false, games, sample: false, refetch: jest.fn() });
}

describe("MyListScreen（マイ牌譜一覧）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("下書きがある半荘のバッジは件数を出さず「下書き」表記になる", () => {
    setGames([makeGame({ draftCount: 2 })]);
    render(<MyListScreen />);

    expect(screen.getByText("下書き")).toBeTruthy();
    expect(screen.queryByText("下書き2")).toBeNull();
  });

  it("「＋ 新規」を押すと作成画面（Capture）へ遷移する", () => {
    setGames([makeGame()]);
    render(<MyListScreen />);

    fireEvent.press(screen.getByText("＋ 新規"));
    expect(mockNavigate).toHaveBeenCalledWith("Capture");
  });

  it("半荘が無いときも「＋ 新規」が出て、空状態文言が新規ボタンを案内する", () => {
    setGames([]);
    render(<MyListScreen />);

    expect(screen.getByText("＋ 新規")).toBeTruthy();
    expect(
      screen.getByText("まだ半荘がありません。「＋ 新規」から撮影、または手入力で記録できます。"),
    ).toBeTruthy();
  });
});
