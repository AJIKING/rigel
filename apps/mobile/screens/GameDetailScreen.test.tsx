import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { GameDetail } from "../lib/api";
import { GameDetailScreen } from "./GameDetailScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { gameId: "g1" } }),
  // フォーカス時の再取得はこのテストの関心外（no-op）。
  useFocusEffect: () => {},
}));

jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: "t", user: { plan: "free" } }),
}));

const mockUseGame = jest.fn();
jest.mock("../lib/use-kifu-data", () => ({
  useGame: (...args: unknown[]) => mockUseGame(...args),
}));

const mockRetryAnalysis = jest.fn();
const mockListGamePhotos = jest.fn<Promise<unknown[]>, unknown[]>(() => Promise.resolve([]));
jest.mock("../lib/api", () => ({
  API_BASE_URL: "https://api.test",
  deleteGame: jest.fn(),
  deleteKifu: jest.fn(),
  listGamePhotos: (...args: unknown[]) => mockListGamePhotos(...args),
  retryAnalysis: (...args: unknown[]) => mockRetryAnalysis(...args),
  setGameStatus: jest.fn(),
  setGameVisibility: jest.fn(),
  updateGame: jest.fn(),
  updateGamePlayers: jest.fn(),
  updateGameRules: jest.fn(),
}));

function makeKifu(honba = 0, east: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-07-04T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east", honba },
    seats: { east, south: {}, west: {}, north: {} },
  });
}

function makeDetail(logs: { id: string; seq: number; honba?: number }[]): GameDetail {
  return {
    game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-07-01T00:00:00.000Z" },
    favoriteCount: 0,
    viewerFaved: false,
    analysisStatus: null,
    analysisJobId: null,
    logs: logs.map((l) => ({
      id: l.id,
      userId: "u1",
      gameId: "g1",
      seq: l.seq,
      kifu: makeKifu(l.honba ?? 0),
      visibility: "private" as const,
      status: "complete" as const,
      createdAt: "2026-07-01T00:00:00.000Z",
    })),
  };
}

describe("GameDetailScreen（半荘詳細の局一覧）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("連荘（同じ局順で本場違い）は局一覧で本場つきで区別できる", () => {
    mockUseGame.mockReturnValue({
      loading: false,
      detail: makeDetail([
        { id: "l1", seq: 1, honba: 0 },
        { id: "l2", seq: 1, honba: 1 },
      ]),
      refetch: jest.fn(),
    });
    render(<GameDetailScreen />);
    expect(screen.getByText(/東一局 0本場/)).toBeTruthy();
    expect(screen.getByText(/東一局 1本場/)).toBeTruthy();
  });

  it("読めなかった牌（null）があっても「要確認」バッジは出さない（[決定] 2026-08-02 オーナー: 表示廃止）", () => {
    const detail = makeDetail([{ id: "l1", seq: 1 }]);
    detail.logs[0]!.kifu = makeKifu(0, { hand: [{ tile: null }, { tile: "1m" }] });
    mockUseGame.mockReturnValue({ loading: false, detail, refetch: jest.fn() });
    render(<GameDetailScreen />);
    expect(screen.queryByText(/要確認/)).toBeNull();
  });

  it("解析中の半荘は 0 局でも「AI解析中」の案内を出す（plan 8-3）", () => {
    const detail = makeDetail([]);
    detail.analysisStatus = "processing";
    mockUseGame.mockReturnValue({ loading: false, detail, refetch: jest.fn() });
    render(<GameDetailScreen />);

    expect(screen.getByText(/AI解析中/)).toBeTruthy();
  });

  it("解析に失敗した半荘は失敗ステータスを表示する（[決定] 2026-08-02 オーナー）", () => {
    const detail = makeDetail([]);
    detail.analysisStatus = "failed";
    mockUseGame.mockReturnValue({ loading: false, detail, refetch: jest.fn() });
    render(<GameDetailScreen />);

    expect(screen.getByText(/解析に失敗しました/)).toBeTruthy();
  });

  it("「元写真」チップでシートが開き、所有者限定の注記と空状態を出す（photo-retention.md）", async () => {
    mockUseGame.mockReturnValue({ loading: false, detail: makeDetail([]), refetch: jest.fn() });
    render(<GameDetailScreen />);

    fireEvent.press(screen.getByText("元写真"));

    expect(await screen.findByText(/元写真はありません/)).toBeTruthy();
    expect(screen.getByText(/あなたにだけ表示されます/)).toBeTruthy();
    expect(mockListGamePhotos).toHaveBeenCalledWith("t", "g1");
  });

  it("失敗＋ジョブIDありなら「もう一度解析」ボタンを出し、202 で再取得する（Phase 2）", async () => {
    const detail = makeDetail([]);
    detail.analysisStatus = "failed";
    detail.analysisJobId = "job-9";
    const refetch = jest.fn();
    mockUseGame.mockReturnValue({ loading: false, detail, refetch });
    mockRetryAnalysis.mockResolvedValue({ ok: true, jobId: "job-9", gameId: "g1" });
    render(<GameDetailScreen />);

    fireEvent.press(screen.getByText("もう一度解析"));

    await waitFor(() => expect(mockRetryAnalysis).toHaveBeenCalledWith("t", "job-9"));
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("再解析の期限切れ（retry_expired）は写真からの再送信を促す文言を出す", async () => {
    const detail = makeDetail([]);
    detail.analysisStatus = "failed";
    detail.analysisJobId = "job-9";
    mockUseGame.mockReturnValue({ loading: false, detail, refetch: jest.fn() });
    mockRetryAnalysis.mockResolvedValue({ ok: false, status: 400, reason: "retry_expired" });
    render(<GameDetailScreen />);

    fireEvent.press(screen.getByText("もう一度解析"));

    expect(await screen.findByText(/もう一度写真から送信/)).toBeTruthy();
  });

  it("最後の1局の✕は無言で無視せず、消せない理由を表示する", () => {
    mockUseGame.mockReturnValue({
      loading: false,
      detail: makeDetail([{ id: "l1", seq: 1 }]),
      refetch: jest.fn(),
    });
    render(<GameDetailScreen />);

    fireEvent.press(screen.getByLabelText("第1局を削除"));

    expect(screen.getByText(/最後の1局は削除できません/)).toBeTruthy();
  });

  it("2局以上あれば✕で確認ダイアログが出る", () => {
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockUseGame.mockReturnValue({
      loading: false,
      detail: makeDetail([
        { id: "l1", seq: 1 },
        { id: "l2", seq: 2 },
      ]),
      refetch: jest.fn(),
    });
    render(<GameDetailScreen />);

    fireEvent.press(screen.getByLabelText("第1局を削除"));

    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("東一局を削除しますか"),
      expect.anything(),
      expect.anything(),
    );
    alertSpy.mockRestore();
  });
});

describe("GameDetailScreen（対局日の編集）", () => {
  beforeEach(() => jest.clearAllMocks());

  function renderWith() {
    const refetch = jest.fn();
    mockUseGame.mockReturnValue({
      loading: false,
      detail: makeDetail([{ id: "l1", seq: 1 }]),
      refetch,
    });
    render(<GameDetailScreen />);
    return refetch;
  }

  it("日付をタップすると YYYY-MM-DD で編集でき、保存で updateGame(createdAt) が呼ばれる", async () => {
    const api = jest.requireMock("../lib/api") as { updateGame: jest.Mock };
    api.updateGame.mockResolvedValue({ ok: true, status: 200 });
    const refetch = renderWith();

    fireEvent.press(screen.getByLabelText("対局日を変更"));
    const input = screen.getByLabelText("対局日");
    expect(input.props.value).toBe("2026-07-01");

    fireEvent.changeText(input, "2026-06-28");
    fireEvent.press(screen.getByLabelText("対局日を保存"));

    await waitFor(() =>
      expect(api.updateGame).toHaveBeenCalledWith("t", "g1", { createdAt: "2026-06-28" }),
    );
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("YYYY-MM-DD 形式でない入力は保存せずエラーを出す", async () => {
    const api = jest.requireMock("../lib/api") as { updateGame: jest.Mock };
    renderWith();

    fireEvent.press(screen.getByLabelText("対局日を変更"));
    fireEvent.changeText(screen.getByLabelText("対局日"), "6/28");
    fireEvent.press(screen.getByLabelText("対局日を保存"));

    expect(api.updateGame).not.toHaveBeenCalled();
    expect(await screen.findByText(/YYYY-MM-DD/)).toBeTruthy();
  });

  it("操作ボタンは絵文字なしの統一ラベルで並ぶ（局を追加/ルール設定/選手情報/半荘を削除）", () => {
    renderWith();

    expect(screen.getByText("＋ 局を追加")).toBeTruthy();
    expect(screen.getByText("ルール設定")).toBeTruthy();
    expect(screen.getByText("選手情報")).toBeTruthy();
    expect(screen.getByText("半荘を削除")).toBeTruthy();
    expect(screen.queryByText(/⚙|👤/)).toBeNull();
  });
});
