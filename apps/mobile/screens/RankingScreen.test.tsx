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

function entry(over: Partial<QuizRankingDto["correct"][number]> = {}) {
  return {
    rank: 1,
    handle: "taro",
    displayName: "太郎",
    correct: 120,
    total: 200,
    accuracy: 0.6,
    ...over,
  };
}

function dto(over: Partial<QuizRankingDto> = {}): QuizRankingDto {
  return {
    kind: "score",
    period: "weekly",
    correct: [entry()],
    accuracy: [entry({ handle: "jiro", displayName: "次郎", accuracy: 0.9 })],
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
  it("初期表示は先頭種目×週間で取得し、2ボードに順位・表示名・値が並ぶ", async () => {
    render(<RankingScreen />);

    expect(await screen.findByText("正解数")).toBeTruthy();
    expect(mockGetQuizRanking).toHaveBeenCalledWith("score", "weekly", undefined);
    const correct = within(screen.getByTestId("board-correct"));
    expect(correct.getByText("太郎")).toBeTruthy();
    expect(correct.getByText("120問")).toBeTruthy();
    const accuracy = within(screen.getByTestId("board-accuracy"));
    expect(accuracy.getByText("次郎")).toBeTruthy();
    expect(accuracy.getByText("90%")).toBeTruthy();
    expect(accuracy.getByText("50問以上回答した人が対象")).toBeTruthy();
  });

  it("種目・期間の切替で再取得し、取得中も前の表示を保つ（全面スピナーに戻さない）", async () => {
    let resolveNext: ((d: QuizRankingDto) => void) | null = null;
    render(<RankingScreen />);
    await screen.findByText("正解数");

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

  it("サインイン時は token 付きで取得し、自分の順位（me）を出す", async () => {
    mockToken = "t";
    mockGetQuizRanking.mockResolvedValue(
      dto({ me: { correctRank: 12, accuracyRank: 3, correct: 40, total: 50, accuracy: 0.8 } }),
    );
    render(<RankingScreen />);

    expect(await screen.findByText(/あなた:/)).toBeTruthy();
    expect(mockGetQuizRanking).toHaveBeenCalledWith("score", "weekly", "t");
    expect(screen.getByText(/12位/)).toBeTruthy();
    expect(screen.getByText(/3位/)).toBeTruthy();
  });

  it("取得失敗は読み込みエラーの文言（「0件」と混同させない）", async () => {
    mockGetQuizRanking.mockRejectedValue(new Error("network"));
    render(<RankingScreen />);
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
  });
});
