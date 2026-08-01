// 撮影画面のテスト。解析枠は撮る前に見えることが重要
// （選んで送ってから 403 で知るのでは撮影の手間が無駄になる）。
// 解析は非同期ジョブ（202 + ポーリング。docs/plans/async-analysis.md）で、
// 完了で結果画面へ・失敗はインライン表示・開き直しで復元、を固定する。

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { CaptureScreen } from "./CaptureScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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

const mockPoll = jest.fn<Promise<unknown>, unknown[]>();
const mockSave = jest.fn(() => Promise.resolve());
const mockClear = jest.fn(() => Promise.resolve());
let mockPending: { jobId: string; startedAt: number } | null = null;
jest.mock("../lib/analysis-job", () => ({
  pollAnalysisJob: (...a: unknown[]) => mockPoll(...a),
  savePendingAnalysis: (...a: unknown[]) => mockSave(...(a as [])),
  loadPendingAnalysis: () => Promise.resolve(mockPending),
  clearPendingAnalysis: () => mockClear(),
}));

describe("CaptureScreen（解析枠の表示）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending = null;
  });

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

describe("CaptureScreen（非同期ジョブの解析フロー）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPending = null;
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

  it("送信 → ジョブ保存 → ポーリング完了で結果画面へ（ジョブは後始末）", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g1", logId: "l1" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("GameDetail", { gameId: "g1" }));
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-1" }));
    expect(mockClear).toHaveBeenCalled();
  });

  it("ジョブ失敗は理由の文言をインライン表示し、遷移しない", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    mockPoll.mockResolvedValue({ kind: "failed", message: "この半荘はこれ以上局を追加できません" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(screen.getByText(/これ以上局を追加できません/)).toBeTruthy());
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockClear).toHaveBeenCalled();
  });

  it("打ち切り（timeout）は「完了すると牌譜一覧に載る」旨を案内する", async () => {
    mockAnalyze.mockResolvedValue({ ok: true, jobId: "job-1" });
    mockPoll.mockResolvedValue({ kind: "timeout" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(screen.getByText(/牌譜一覧/)).toBeTruthy());
  });

  it("送信自体の失敗（枠切れ等）は従来のステータス文言を出す", async () => {
    mockAnalyze.mockResolvedValue({ ok: false, status: 402, reason: "quota_exceeded" });
    render(<CaptureScreen />);

    await pickRiverAndSubmit();

    await waitFor(() => expect(screen.getByText(/上限/)).toBeTruthy());
    expect(mockPoll).not.toHaveBeenCalled();
  });

  it("開き直しで pending ジョブがあればポーリングを再開し、完了で結果画面へ", async () => {
    mockPending = { jobId: "job-9", startedAt: 100 };
    mockPoll.mockResolvedValue({ kind: "done", gameId: "g9", logId: "l9" });
    render(<CaptureScreen />);

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("GameDetail", { gameId: "g9" }));
    expect(mockPoll).toHaveBeenCalledWith("tok", { jobId: "job-9", startedAt: 100 });
  });
});
