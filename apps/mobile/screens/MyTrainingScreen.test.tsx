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

describe("MyTrainingScreen（マイページ 特訓: 種目別グラフ・履歴）", () => {
  it("履歴を listQuizSessions(token) で取得し、履歴行（日時JST・種目・スコア・正答率）を新しい順に出す", async () => {
    render(<MyTrainingScreen now={NOW} />);

    expect(await screen.findByText("1分あたり正解数の推移")).toBeTruthy();
    expect(mockListQuizSessions).toHaveBeenCalledWith("t");

    // 先頭 = 一番新しい s2（JST 7/23 10:00・清一色・5/10）。
    const dates = screen.getAllByText(/^2026\/07\//);
    expect(dates[0]!.props.children).toBe("2026/07/23 10:00");
    // 履歴は期間で絞らない（7d 窓の外の牌効率も出る）。
    expect(screen.getAllByText("牌効率")).toHaveLength(1);
    expect(screen.getByText("5 / 10問")).toBeTruthy();
    expect(screen.getByText("正答率 50%")).toBeTruthy();
    expect(screen.getByText("正答率 90%")).toBeTruthy();
  });

  // 1分あたり正解数は種目ごとに1問の重さが違うので、混ぜた合算は「上達」を表さない。
  it("全種目をまとめたサマリ枠も「全種目」チップも無い（種目をまたいだ合算を見せない）", async () => {
    render(<MyTrainingScreen now={NOW} />);
    await screen.findByText("1分あたり正解数の推移");

    expect(screen.queryByText("挑戦回数")).toBeNull();
    expect(screen.queryByText("自己ベスト")).toBeNull();
    expect(screen.queryByText("平均正答率")).toBeNull();
    expect(screen.queryByText("全種目")).toBeNull();
  });

  it("記録のある種目だけグラフを並べ、各カードにその種目・その期間のサマリを出す", async () => {
    render(<MyTrainingScreen now={NOW} />);
    await screen.findByText("1分あたり正解数の推移");

    // 7d 窓の記録は清一色 何待ちだけ（牌効率は10日前）。
    expect(screen.getByLabelText("清一色 何待ちの1分あたり正解数の推移（7日）")).toBeTruthy();
    expect(screen.queryByLabelText("牌効率の1分あたり正解数の推移（7日）")).toBeNull();
    expect(screen.getByText("2回 ・ ベスト 7 ・ 正答率 60%")).toBeTruthy();
  });

  it("期間チップ（7日/30日/全期間）でグラフの期間と並ぶ種目が切り替わる", async () => {
    render(<MyTrainingScreen now={NOW} />);
    await screen.findByText("1分あたり正解数の推移");

    fireEvent.press(screen.getByText("30日"));
    // 30日に広げると牌効率（10日前）も1枚増える。
    expect(screen.getByLabelText("牌効率の1分あたり正解数の推移（30日）")).toBeTruthy();
    expect(screen.getByLabelText("清一色 何待ちの1分あたり正解数の推移（30日）")).toBeTruthy();

    fireEvent.press(screen.getByText("全期間"));
    expect(screen.getByLabelText("清一色 何待ちの1分あたり正解数の推移（全期間）")).toBeTruthy();
  });

  it("記録が無ければグラフを1枚も出さず、空状態は短い1文（共有文言）", async () => {
    mockListQuizSessions.mockResolvedValue([]);
    render(<MyTrainingScreen now={NOW} />);

    expect(await screen.findByText("まだ特訓の記録がありません")).toBeTruthy();
    expect(screen.queryByText("1分あたり正解数の推移")).toBeNull();
  });

  it("未ログインはログイン案内を出し、API を呼ばない", () => {
    mockToken = null;
    render(<MyTrainingScreen now={NOW} />);

    expect(screen.getByText("ログインすると特訓の記録が見られます。")).toBeTruthy();
    expect(mockListQuizSessions).not.toHaveBeenCalled();
  });
});
