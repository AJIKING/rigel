import type { QuizRankingDto } from "@rigel/client";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { RankingScreen } from "./RankingScreen";

const mockGetQuizRanking = jest.fn();
jest.mock("../lib/api", () => ({
  getQuizRanking: (...args: unknown[]) => mockGetQuizRanking(...args),
}));

let mockToken: string | null = null;
jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: mockToken, user: null }),
}));

function entry(over: Partial<QuizRankingDto["entries"][number]> = {}) {
  return {
    rank: 1,
    handle: "taro",
    displayName: "太郎",
    correct: 120,
    total: 200,
    accuracy: 0.6,
    score: 72, // 120 × 60%
    ...over,
  };
}

function dto(over: Partial<QuizRankingDto> = {}): QuizRankingDto {
  return {
    kind: "score",
    period: "weekly",
    entries: [entry()],
    me: null,
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = null;
  mockGetQuizRanking.mockResolvedValue(dto());
});

describe("RankingScreen（特訓ランキング。匿名可）", () => {
  it("初期表示は先頭種目×週間で取得し、スコアボードに順位・表示名・内訳・スコアが並ぶ", async () => {
    render(<RankingScreen />);

    expect(await screen.findByText("太郎")).toBeTruthy();
    // スコアの定義注記は出さない（2026-08-08 オーナー削除依頼）。
    expect(screen.queryByText("スコア = 正解数 × 正答率")).toBeNull();
    expect(mockGetQuizRanking).toHaveBeenCalledWith("score", "weekly", undefined);
    const board = within(screen.getByTestId("board-score"));
    expect(board.getByText("太郎")).toBeTruthy();
    expect(board.getByText("120問・60%")).toBeTruthy(); // 内訳
    expect(board.getByText("72.0")).toBeTruthy(); // スコア（小数1桁）
  });

  it("種目・期間の切替で再取得し、取得中も前の表示を保つ（全面スピナーに戻さない）", async () => {
    let resolveNext: ((d: QuizRankingDto) => void) | null = null;
    render(<RankingScreen />);
    await screen.findByText("太郎");

    // 2回目以降の取得は保留にして「取得中」の表示を確かめる。
    mockGetQuizRanking.mockImplementation(
      () =>
        new Promise<QuizRankingDto>((res) => {
          resolveNext = res;
        }),
    );
    fireEvent.press(screen.getByText("牌効率"));
    // 前の表示（ボードと行）は保たれている（スクロール位置を失う全面スピナーにしない）。
    expect(screen.getByTestId("ranking-boards")).toBeTruthy();
    expect(screen.getByText("太郎")).toBeTruthy();
    expect(mockGetQuizRanking).toHaveBeenLastCalledWith("efficiency", "weekly", undefined);

    await act(async () => resolveNext!(dto()));
    fireEvent.press(screen.getByText("月間"));
    expect(mockGetQuizRanking).toHaveBeenLastCalledWith("efficiency", "monthly", undefined);
  });

  it("初回の取得中はローディング（ボードはまだ無い）", () => {
    mockGetQuizRanking.mockImplementation(() => new Promise(() => {}));
    render(<RankingScreen />);
    expect(screen.queryByTestId("ranking-boards")).toBeNull();
    expect(screen.queryByText(/読み込めませんでした/)).toBeNull();
  });

  it("サインイン時は token 付きで取得し、自分の順位（me）をスコアつきで出す", async () => {
    mockToken = "t";
    mockGetQuizRanking.mockResolvedValue(
      dto({ me: { rank: 12, correct: 40, total: 50, accuracy: 0.8, score: 32 } }),
    );
    render(<RankingScreen />);

    expect(await screen.findByText(/あなた:/)).toBeTruthy();
    expect(mockGetQuizRanking).toHaveBeenCalledWith("score", "weekly", "t");
    expect(screen.getByText(/12位/)).toBeTruthy();
    expect(screen.getByText(/スコア 32\.0/)).toBeTruthy();
  });

  it("取得失敗は読み込みエラーの文言（「0件」と混同させない）", async () => {
    mockGetQuizRanking.mockRejectedValue(new Error("network"));
    render(<RankingScreen />);
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
  });

  it("記録が無ければ空状態の文言を出す（web と同一文言）", async () => {
    mockGetQuizRanking.mockResolvedValue(dto({ entries: [] }));
    render(<RankingScreen />);
    expect(await screen.findByText("まだ記録がありません")).toBeTruthy();
  });
});
