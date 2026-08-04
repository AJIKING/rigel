import type { QuizSessionDetailDto } from "@rigel/client";
import { jstDateTime } from "@rigel/ui";
import { render, screen } from "@testing-library/react-native";
import { TrainingSessionScreen } from "./TrainingSessionScreen";

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { id: "qs1" } }),
}));

const mockGetQuizSession = jest.fn();
jest.mock("../lib/api", () => ({
  getQuizSession: (...args: unknown[]) => mockGetQuizSession(...args),
}));

let mockToken: string | null = "t";
jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: mockToken, user: mockToken ? { plan: "next" } : null }),
}));

function detail(over: Partial<QuizSessionDetailDto> = {}): QuizSessionDetailDto {
  return {
    id: "qs1",
    kind: "efficiency",
    total: 2,
    correct: 1,
    durationMs: 60_000,
    createdAt: "2026-07-24T03:05:00.000Z", // JST 7/24 12:05
    records: null,
    ...over,
  };
}

/** 牌効率レコード2件（1問目○・2問目×。web の詳細テストと同じフィクスチャ）。 */
const RECORDS: QuizSessionDetailDto["records"] = [
  {
    question: {
      kind: "efficiency",
      // prettier-ignore
      tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
      shanten: 2,
      answer: ["9s", "4z", "7z"],
    },
    picked: ["9s"],
    ok: true,
  },
  {
    question: {
      kind: "efficiency",
      // prettier-ignore
      tiles: ["3m", "4m", "4p", "5p", "6p", "8p", "7s", "8s", "9s", "2z", "3z", "3z", "6z", "7z"],
      shanten: 2,
      answer: ["2z", "6z", "7z"],
    },
    picked: ["3m"],
    ok: false,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockToken = "t";
});

describe("TrainingSessionScreen（特訓セッション詳細）", () => {
  it("getQuizSession(token, id) で取得し、種目・日時・スコアと保存された見直しレコードを出す", async () => {
    mockGetQuizSession.mockResolvedValue(detail({ records: RECORDS }));
    render(<TrainingSessionScreen />);

    expect(await screen.findByText("牌効率")).toBeTruthy();
    expect(mockGetQuizSession).toHaveBeenCalledWith("t", "qs1");
    expect(screen.getByText(jstDateTime("2026-07-24T03:05:00.000Z"))).toBeTruthy();
    expect(screen.getByText("正解 1問")).toBeTruthy();
    expect(screen.getByText("出題 2問")).toBeTruthy();
    expect(screen.getByText("正答率 50%")).toBeTruthy();
    // 見直しレコード（結果画面と同じ行構造）。受け入れ詳細も出る。
    expect(screen.getByTestId("review-row-1")).toBeTruthy();
    expect(screen.getByTestId("review-row-2")).toBeTruthy();
    expect(screen.getByTestId("review-ukeire-mine-1")).toBeTruthy();
    expect(screen.queryByText(/有料プランの機能/)).toBeNull();
  });

  it("records=null（無料・ダウングレード）は案内を出し、見直しレコードは出さない", async () => {
    mockGetQuizSession.mockResolvedValue(detail({ records: null }));
    render(<TrainingSessionScreen />);

    expect(await screen.findByText(/見直しの保存・閲覧は有料プランの機能です/)).toBeTruthy();
    expect(screen.queryByTestId("review-row-1")).toBeNull();
  });

  it("token が無い（ゲスト等）はサインイン案内を出し、取得 API を呼ばない", async () => {
    mockToken = null;
    render(<TrainingSessionScreen />);
    expect(await screen.findByText("サインインすると特訓の記録が見られます。")).toBeTruthy();
    expect(mockGetQuizSession).not.toHaveBeenCalled();
  });

  it("見つからない（404=null）は not found の案内・取得失敗は読み込みエラーの文言", async () => {
    mockGetQuizSession.mockResolvedValue(null);
    render(<TrainingSessionScreen />);
    expect(await screen.findByText("記録が見つかりませんでした。")).toBeTruthy();

    mockGetQuizSession.mockRejectedValue(new Error("network"));
    render(<TrainingSessionScreen />);
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
  });
});
