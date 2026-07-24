import { KifuSchema, type Kifu } from "@rigel/schema";
import { render, screen } from "@testing-library/react-native";
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

jest.mock("../lib/api", () => ({
  deleteGame: jest.fn(),
  deleteKifu: jest.fn(),
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

  it("読めなかった牌（null）を含む局には「要確認」バッジを出す（人手修正の入口）", () => {
    const detail = makeDetail([{ id: "l1", seq: 1 }]);
    detail.logs[0]!.kifu = makeKifu(0, { hand: [{ tile: null }, { tile: "1m" }] });
    mockUseGame.mockReturnValue({ loading: false, detail, refetch: jest.fn() });
    render(<GameDetailScreen />);
    expect(screen.getByText("要確認 1")).toBeTruthy();
  });
});
