// 一覧データ取得フックの状態（成功／未ログイン／通信失敗）。
// **通信失敗を「0件」にも「架空のサンプル」にも化けさせない**のが要点。
// サンプルは「未ログインで中身の雰囲気を見せる」ためだけのもので、失敗の代役ではない。

import { renderHook, waitFor } from "@testing-library/react-native";
import { useMyGames, usePublicGames } from "./use-kifu-data";

const mockGetMyGames = jest.fn();
const mockGetPublicGames = jest.fn();
const mockGetGame = jest.fn();
jest.mock("./api", () => ({
  getMyGames: (...a: unknown[]) => mockGetMyGames(...a),
  getPublicGames: (...a: unknown[]) => mockGetPublicGames(...a),
  getGame: (...a: unknown[]) => mockGetGame(...a),
}));

let mockAuth: { token: string | null; loading?: boolean };
jest.mock("./auth", () => ({ useAuth: () => mockAuth }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth = { token: "t" };
});

describe("usePublicGames（公開牌譜フィード・認証不要）", () => {
  it("成功したら取得した一覧を返す", async () => {
    mockGetPublicGames.mockResolvedValue([{ id: "g1" }]);
    const { result } = renderHook(() => usePublicGames());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.games).toEqual([{ id: "g1" }]);
    expect(result.current.error).toBeUndefined();
  });

  it("通信に失敗したらサンプルを出さず、失敗を伝える（架空の牌譜を本物のように見せない）", async () => {
    mockGetPublicGames.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => usePublicGames());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.games).toEqual([]);
    expect(result.current.sample).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});

describe("useMyGames（要ログイン）", () => {
  it("未ログインはサンプルを見せる（雰囲気を伝える意図。sample=true で明示）", async () => {
    mockAuth = { token: null };
    const { result } = renderHook(() => useMyGames());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sample).toBe(true);
    expect(result.current.games.length).toBeGreaterThan(0);
    expect(result.current.error).toBeUndefined();
  });

  it("ログイン済みで通信に失敗したら、空でもサンプルでもなく失敗を伝える", async () => {
    mockGetMyGames.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useMyGames());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sample).toBe(false);
    expect(result.current.error).toBeTruthy();
  });
});
