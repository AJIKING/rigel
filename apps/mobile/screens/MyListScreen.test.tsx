import { fireEvent, render, screen } from "@testing-library/react-native";
import type { MyGameCard } from "../lib/api";
import { MyListScreen } from "./MyListScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // フォーカス時の再取得はこのテストの関心外（no-op）。
  useFocusEffect: () => {},
}));

let mockAuth: { token: string | null; user: { plan: string } | null } = {
  token: "t",
  user: { plan: "free" },
};
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockUseMyGames = jest.fn();
jest.mock("../lib/use-kifu-data", () => ({
  useMyGames: (...args: unknown[]) => mockUseMyGames(...args),
}));

jest.mock("../lib/api", () => ({
  deleteGame: jest.fn(),
}));

// お気に入りはサーバー保存。状態はカードが持つので apply はそのまま返す。
const mockToggleFav = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  useFavorites: () => ({
    apply: (cards: unknown[]) => cards,
    toggle: mockToggleFav,
    error: null,
  }),
}));

// 解析ジョブ（非同期解析の進行カード。docs/plans/async-analysis.md 8-2）。
const mockDismiss = jest.fn();
let mockJob: {
  card: { kind: string; seq?: number; message?: string } | null;
  completedCount: number;
} = { card: null, completedCount: 0 };
jest.mock("../lib/use-analysis-job", () => ({
  useAnalysisJob: () => ({ ...mockJob, start: jest.fn(), dismiss: mockDismiss }),
}));

function makeGame(overrides: Partial<MyGameCard> = {}): MyGameCard {
  return {
    id: "g1",
    title: "東風戦",
    createdAt: "2026-07-01T00:00:00.000Z",
    kyokuCount: 4,
    publicCount: 0,
    draftCount: 0,
    favoriteCount: 0,
    viewerFaved: false,
    ...overrides,
  };
}

function setGames(games: MyGameCard[]) {
  mockUseMyGames.mockReturnValue({ loading: false, games, sample: false, refetch: jest.fn() });
}

describe("MyListScreen（マイ牌譜一覧）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
    mockJob = { card: null, completedCount: 0 };
  });

  it("解析中カードを一覧の上に出す（局名＋閉じてもOKの案内。半荘0件でも出る）", () => {
    mockJob = { card: { kind: "processing", seq: 1 }, completedCount: 0 };
    setGames([]);
    render(<MyListScreen />);

    expect(screen.getByText("AI解析中…")).toBeTruthy();
    expect(screen.getByText(/東一局を作成しています/)).toBeTruthy();
    expect(screen.getByText(/アプリを閉じてもOK/)).toBeTruthy();
  });

  it("解析失敗カードは理由と✕を出し、✕で dismiss する", () => {
    mockJob = {
      card: { kind: "failed", message: "今月の解析回数の上限に達しました。" },
      completedCount: 0,
    };
    setGames([makeGame()]);
    render(<MyListScreen />);

    expect(screen.getByText("解析に失敗しました")).toBeTruthy();
    expect(screen.getByText(/上限に達しました/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("解析の通知を閉じる"));
    expect(mockDismiss).toHaveBeenCalled();
  });

  it("解析完了（completedCount の変化）で一覧を再取得する", () => {
    const refetch = jest.fn();
    mockJob = { card: null, completedCount: 1 };
    mockUseMyGames.mockReturnValue({ loading: false, games: [], sample: false, refetch });
    render(<MyListScreen />);

    expect(refetch).toHaveBeenCalled();
  });

  it("未サインイン（ゲスト・サンプル表示）では「＋ 新規」を出さない（作成にはサインインが必要）", () => {
    mockAuth = { token: null, user: null };
    mockUseMyGames.mockReturnValue({
      loading: false,
      games: [makeGame()],
      sample: true,
      refetch: jest.fn(),
    });
    render(<MyListScreen />);

    expect(screen.getByText(/サンプル表示中/)).toBeTruthy();
    expect(screen.queryByText("＋ 新規")).toBeNull();
  });

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

  it("並べ替えの選択肢は 新しい順/古い順/お気に入りが多い順（局数順は出さない。web と統一）", () => {
    setGames([makeGame()]);
    render(<MyListScreen />);

    // 並び順はシートから選ぶ（[決定] 2026-07-29。3択セグメントは幅を取るため廃止）。
    fireEvent.press(screen.getByLabelText("並び替え"));
    expect(screen.getByText("新しい順")).toBeTruthy();
    expect(screen.getByText("古い順")).toBeTruthy();
    expect(screen.getByText("お気に入りが多い順")).toBeTruthy();
    expect(screen.queryByText("局数が多い順")).toBeNull();
  });

  it("「お気に入りが多い順」で並べ替えられる", () => {
    setGames([
      makeGame({ id: "g1", title: "少ない", favoriteCount: 1 }),
      makeGame({ id: "g2", title: "多い", favoriteCount: 12 }),
    ]);
    render(<MyListScreen />);

    fireEvent.press(screen.getByLabelText("並び替え"));
    fireEvent.press(screen.getByText("お気に入りが多い順"));
    // 並び順ボタンのラベルを拾わないよう、カードのタイトルだけを完全一致で集める。
    const titles = screen.getAllByText(/^(多い|少ない)$/).map((t) => t.props.children as string);
    expect(titles).toEqual(["多い", "少ない"]);
  });

  it("「お気に入りのみ表示」で自分が付けた半荘だけに絞れる", () => {
    // タイトルはチップの見えるラベル「お気に入り」と衝突しない値にする。
    setGames([
      makeGame({ id: "g1", title: "スター付き", viewerFaved: true }),
      makeGame({ id: "g2", title: "ふつう" }),
    ]);
    render(<MyListScreen />);

    fireEvent.press(screen.getByLabelText("お気に入りのみ表示"));
    expect(screen.getByText("スター付き")).toBeTruthy();
    expect(screen.queryByText("ふつう")).toBeNull();
  });

  it("カードの★を押すとサーバー保存の toggle が種別つきで呼ばれる", () => {
    setGames([makeGame({ id: "g1", favoriteCount: 3 })]);
    render(<MyListScreen />);

    fireEvent.press(screen.getByLabelText("お気に入りに追加/解除（3件）"));
    expect(mockToggleFav).toHaveBeenCalledWith("game", expect.objectContaining({ id: "g1" }));
  });
});

describe("MyListScreen（取得失敗を空状態に化けさせない）", () => {
  it("失敗したら理由を出す（「まだ半荘がありません」と言わない）", () => {
    mockUseMyGames.mockReturnValue({
      loading: false,
      games: [],
      sample: false,
      error: "読み込めませんでした。通信状況を確認して、画面を再読み込みしてください。",
      refetch: jest.fn(),
    });
    render(<MyListScreen />);

    expect(screen.getByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/まだ半荘がありません/)).toBeNull();
  });
});
