// 撮影画面のテスト。解析枠は撮る前に見えることが重要
// （選んで送ってから 403 で知るのでは撮影の手間が無駄になる）。
// 解析は非同期ジョブ（202 + ポーリング。docs/plans/async-analysis.md）で、
// 完了で結果画面へ・失敗はインライン表示・開き直しで復元、を固定する。

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CaptureScreen } from "./CaptureScreen";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: undefined }),
}));

let mockAuth: {
  token: string | null;
  user: { plan: string; remainingCalls?: number; monthlyCallQuota?: number } | null;
};
jest.mock("../lib/auth", () => ({ useAuth: () => mockAuth }));

const mockAnalyze = jest.fn<Promise<unknown>, unknown[]>();
jest.mock("../lib/api", () => ({
  analyze: (...a: unknown[]) => mockAnalyze(...a),
  createEmptyKifu: jest.fn(),
  createGame: jest.fn(),
}));
const mockPickImage = jest.fn<Promise<unknown>, []>();
jest.mock("../lib/pick-image", () => ({ pickImage: () => mockPickImage() }));
jest.mock("../lib/upload", () => ({ toUploadFile: (p: unknown) => p }));

// ポーリングはグローバル（use-analysis-job の Provider）の責務。画面は start に渡すだけ。
const mockStart = jest.fn<Promise<boolean>, unknown[]>(() => Promise.resolve(true));
jest.mock("../lib/use-analysis-job", () => ({
  useAnalysisJob: () => ({ card: null, completedCount: 0, start: mockStart, dismiss: jest.fn() }),
}));

describe("CaptureScreen（解析枠の表示）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("有料プランには当月の残り解析枠を表示する", () => {
    mockAuth = { token: "t", user: { plan: "next", remainingCalls: 92, monthlyCallQuota: 100 } };
    render(<CaptureScreen />);

    expect(screen.getByText("解析枠 残り 92 / 100（今月）")).toBeTruthy();
  });

  it("free には解析枠を出さない（写真入力自体が無い）", () => {
    mockAuth = { token: "t", user: { plan: "free" } };
    render(<CaptureScreen />);

    expect(screen.queryByText(/解析枠/)).toBeNull();
  });
});

describe("CaptureScreen（非同期ジョブの解析フロー。案B=送信したら一覧へ）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "tok", user: { plan: "pro", remainingCalls: 320, monthlyCallQuota: 320 } };
    mockPickImage.mockResolvedValue({
      status: "picked",
      file: { uri: "file:///river.jpg", name: "river.jpg", type: "image/jpeg" },
    });
  });

  async function pickRiverAndSubmit() {
    fireEvent.press(screen.getByText("河の写真を選ぶ"));
    await waitFor(() => expect(screen.queryByText("河の写真を選ぶ")).toBeNull());
    fireEvent.press(screen.getByText("解析して保存"));
  }

  it("202 が返ったらジョブを Provider に渡し、元の画面（一覧）へ戻る", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1", seq: 1 }));
  });

  /** RN の FormData（getParts）と whatwg 実装（get）の両対応でフィールド値を読む。 */
  function formField(form: unknown, name: string): string | undefined {
    const f = form as {
      getParts?: () => { fieldName: string; string?: string }[];
      get?: (n: string) => unknown;
    };
    const part = f.getParts?.().find((p) => p.fieldName === name);
    if (part) return part.string;
    const v = f.get?.(name);
    return typeof v === "string" ? v : undefined;
  }

  it("「この写真に自分の手牌も写っている」トグルONで「手前」の手牌欄が隠れる", () => {
    render(<CaptureScreen />);
    expect(screen.getByText("手前")).toBeTruthy();

    fireEvent.press(screen.getByText("この写真に自分の手牌も写っている"));

    expect(screen.queryByText("手前")).toBeNull();
    expect(screen.getByText(/解析回数を1回分多く使います/)).toBeTruthy();
  });

  it("トグルONで送信すると handFromRiver=true がフォームに載る", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    render(<CaptureScreen />);
    fireEvent.press(screen.getByText("この写真に自分の手牌も写っている"));

    await pickRiverAndSubmit();

    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    expect(formField(mockAnalyze.mock.calls[0]![1], "handFromRiver")).toBe("true");
  });

  it("トグルOFF（既定）ならフォームに handFromRiver を載せない", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(mockAnalyze).toHaveBeenCalled());
    expect(formField(mockAnalyze.mock.calls[0]![1], "handFromRiver")).toBeUndefined();
  });

  it("進行中の解析がある（start=false）ときは案内を出し、遷移しない", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-2" });
    mockStart.mockResolvedValueOnce(false);
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(screen.getByText(/解析はひとつずつ/)).toBeTruthy());
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("送信自体の失敗（枠切れ等）はその場でステータス文言を出し、遷移しない", async () => {
    mockAnalyze.mockResolvedValue({ ok: false, status: 402, reason: "quota_exceeded" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(screen.getByText(/上限/)).toBeTruthy());
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
