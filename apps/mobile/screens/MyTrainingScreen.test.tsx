import { fireEvent, render, screen } from "@testing-library/react-native";
import type { QuizSessionDto } from "@rigel/client";
import { MyTrainingScreen } from "./MyTrainingScreen";

const mockListQuizSessions = jest.fn();
jest.mock("../lib/api", () => ({
  listQuizSessions: (...args: unknown[]) => mockListQuizSessions(...args),
}));

let mockToken: string | null = "t";
jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: mockToken, user: mockToken ? { plan: "free" } : null }),
}));

// now = JST 2026-07-24 12:00（テストの決定性のため注入。7d 窓 = JST 7/18〜7/24）。
const NOW = new Date("2026-07-24T03:00:00.000Z");

function mkSession(over: Partial<QuizSessionDto> = {}): QuizSessionDto {
  return {
    id: "s1",
    kind: "chinitsu",
    total: 10,
    correct: 7,
    durationMs: 60_000,
    createdAt: "2026-07-22T01:00:00.000Z", // JST 7/22 10:00
    ...over,
  };
}

// 清一色2件（7d 窓内）＋牌効率1件（10日前 = 7d 窓外・30d 窓内）。web と同じフィクスチャ。
const SESSIONS: QuizSessionDto[] = [
  mkSession({ id: "s1", kind: "chinitsu", correct: 7, total: 10 }),
  mkSession({
    id: "s2",
    kind: "chinitsu",
    correct: 5,
    total: 10,
    createdAt: "2026-07-23T01:00:00.000Z",
  }),
  mkSession({
    id: "s3",
    kind: "efficiency",
    correct: 9,
    total: 10,
    createdAt: "2026-07-14T01:00:00.000Z",
  }),
];

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = "t";
  mockListQuizSessions.mockResolvedValue(SESSIONS);
});

describe("MyTrainingScreen（マイページ 特訓: サマリ・履歴・グラフ）", () => {
  it("履歴を listQuizSessions(token) で取得し、サマリと履歴行（日時JST・種目・スコア・正答率）を新しい順に出す", async () => {
    render(<MyTrainingScreen now={NOW} />);

    expect(await screen.findByText("回数 3")).toBeTruthy();
    expect(mockListQuizSessions).toHaveBeenCalledWith("t");
    expect(screen.getByText("ベストスコア 9")).toBeTruthy();
    expect(screen.getByText("平均正答率 70%")).toBeTruthy();

    // 先頭 = 一番新しい s2（JST 7/23 10:00・清一色・5/10）。
    const dates = screen.getAllByText(/^2026\/07\//);
    expect(dates[0]!.props.children).toBe("2026/07/23 10:00");
    expect(screen.getAllByText("清一色 多面待ち")).toHaveLength(2);
    expect(screen.getByText("牌効率（受け入れ最大）")).toBeTruthy();
    expect(screen.getByText("5 / 10問")).toBeTruthy();
    expect(screen.getByText("正答率 50%")).toBeTruthy();
    expect(screen.getByText("正答率 90%")).toBeTruthy();
  });

  it("期間チップ（7日/30日/全期間）でグラフの期間が切り替わる", async () => {
    render(<MyTrainingScreen now={NOW} />);
    await screen.findByText("回数 3");

    expect(screen.getByLabelText("1分あたり正解数の推移（7日）")).toBeTruthy();
    fireEvent.press(screen.getByText("30日"));
    expect(screen.getByLabelText("1分あたり正解数の推移（30日）")).toBeTruthy();
    fireEvent.press(screen.getByText("全期間"));
    expect(screen.getByLabelText("1分あたり正解数の推移（全期間）")).toBeTruthy();
  });

  it("種目チップで清一色に絞るとサマリと履歴から牌効率の分が消える", async () => {
    render(<MyTrainingScreen now={NOW} />);
    await screen.findByText("回数 3");

    fireEvent.press(screen.getByText("清一色"));
    expect(screen.getByText("回数 2")).toBeTruthy();
    expect(screen.getByText("ベストスコア 7")).toBeTruthy();
    expect(screen.getByText("平均正答率 60%")).toBeTruthy();
    expect(screen.queryByText("牌効率（受け入れ最大）")).toBeNull();
    expect(screen.getAllByText("清一色 多面待ち")).toHaveLength(2);
  });

  it("記録が無ければ空状態の文言を出す（平均正答率は —）", async () => {
    mockListQuizSessions.mockResolvedValue([]);
    render(<MyTrainingScreen now={NOW} />);

    expect(await screen.findByText("まだ記録がありません")).toBeTruthy();
    expect(screen.getByText("回数 0")).toBeTruthy();
    expect(screen.getByText("平均正答率 —")).toBeTruthy();
  });

  it("未ログインはログイン案内を出し、API を呼ばない", () => {
    mockToken = null;
    render(<MyTrainingScreen now={NOW} />);

    expect(screen.getByText("ログインすると特訓の記録が見られます。")).toBeTruthy();
    expect(mockListQuizSessions).not.toHaveBeenCalled();
  });
});
