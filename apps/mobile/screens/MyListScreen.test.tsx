import { fireEvent, render, screen, within } from "@testing-library/react-native";
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

// 解析ジョブ（plan 8-3: 表示はサーバーの analysisStatus バッジ。Provider は refetch トリガのみ）。
let mockJob: { settledCount: number } = { settledCount: 0 };
jest.mock("../lib/use-analysis-job", () => ({
  useAnalysisJob: () => ({ ...mockJob, start: jest.fn() }),
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
    analysisStatus: null,
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
    mockJob = { settledCount: 0 };
  });

  it("解析中の半荘はカードに「解析中」バッジが付く（サーバーの analysisStatus が真実源）", () => {
    setGames([makeGame({ analysisStatus: "processing", kyokuCount: 0 })]);
    render(<MyListScreen />);

    expect(screen.getByText("解析中")).toBeTruthy();
  });

  it("解析に失敗した半荘はカードに「解析失敗」バッジが付く（0局のまま残る。plan 8-3）", () => {
    setGames([makeGame({ analysisStatus: "failed", kyokuCount: 0 })]);
    render(<MyListScreen />);

    expect(screen.getByText("解析失敗")).toBeTruthy();
  });

  it("ジョブの終端（settledCount の変化）で一覧を再取得する", () => {
    const refetch = jest.fn();
    mockJob = { settledCount: 1 };
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

  it("統計ヘッダ（牌譜数・公開数・★された数）を出す（web マイページと同一。Phase D）", () => {
    setGames([
      makeGame({ id: "g1", title: "半荘A", publicCount: 2, favoriteCount: 3 }),
      makeGame({ id: "g2", title: "半荘B", publicCount: 0, favoriteCount: 1 }),
    ]);
    render(<MyListScreen />);

    expect(screen.getByLabelText("牌譜 2件")).toBeTruthy();
    expect(screen.getByLabelText("公開 1件")).toBeTruthy();
    expect(screen.getByLabelText("お気に入りされた数 4件")).toBeTruthy();
  });

  it("検索欄でタイトル部分一致に絞れる（web マイページと同一条件。Phase D）", () => {
    setGames([
      makeGame({ id: "g1", title: "金曜セット" }),
      makeGame({ id: "g2", title: "大会予選" }),
    ]);
    render(<MyListScreen />);

    fireEvent.changeText(screen.getByLabelText("牌譜を検索"), "大会");
    expect(screen.getByText("大会予選")).toBeTruthy();
    expect(screen.queryByText("金曜セット")).toBeNull();
  });

  it("公開状態フィルタで 公開/非公開 に絞れる（web と同一の選択肢）", () => {
    setGames([
      makeGame({ id: "g1", title: "公開済みの半荘", publicCount: 2 }),
      makeGame({ id: "g2", title: "非公開の半荘", publicCount: 0 }),
    ]);
    render(<MyListScreen />);

    // シートの選択肢はカードのバッジ（公開/非公開）と同じ文言なので、シート内で探す。
    fireEvent.press(screen.getByLabelText("公開状態で絞り込み"));
    fireEvent.press(within(screen.getByTestId("bottom-sheet-card")).getByText("公開"));
    expect(screen.getByText("公開済みの半荘")).toBeTruthy();
    expect(screen.queryByText("非公開の半荘")).toBeNull();

    fireEvent.press(screen.getByLabelText("公開状態で絞り込み"));
    fireEvent.press(within(screen.getByTestId("bottom-sheet-card")).getByText("非公開"));
    expect(screen.getByText("非公開の半荘")).toBeTruthy();
    expect(screen.queryByText("公開済みの半荘")).toBeNull();
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
