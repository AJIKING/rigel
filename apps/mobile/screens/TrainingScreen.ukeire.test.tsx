// 結果画面の受け入れ詳細（UkeireDetail）の計算コスト検証（web の
// TrainingScreen.ukeire.test.tsx と同一挙動）。discardUkeires は 14枚×34種の
// 向聴総当たりで重いため、手牌が変わらない再レンダー（例:「もう一度挑戦」失敗時の
// state 更新）で再計算しないこと（useMemo）を、@rigel/ui のモジュール境界スパイで固定する。
// スパイは実装をそのまま呼ぶ透過ラッパ（値の期待は TrainingScreen.test.tsx が保証）。
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { TrainingScreen } from "./TrainingScreen";

let mockAuth: { token: string | null; user: { plan: string } | null; loading?: boolean };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockStartQuizSession = jest.fn();
const mockFinishQuizSession = jest.fn();
jest.mock("../lib/api", () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
  finishQuizSession: (...args: unknown[]) => mockFinishQuizSession(...args),
}));

// Firebase Analytics はネイティブモジュールなのでラッパごとモックする。
jest.mock("../lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

/** TrainingScreen（コンポーネント側）からの discardUkeires 呼び出し回数。
 *  packages/ui 内部（出題生成）の呼び出しはモジュール境界を通らないので数えない。 */
const mockUkeireCalls = { count: 0 };
jest.mock("@rigel/ui", () => {
  const orig = jest.requireActual("@rigel/ui");
  return {
    ...orig,
    discardUkeires: (...args: unknown[]) => {
      mockUkeireCalls.count += 1;
      return orig.discardUkeires(...args);
    },
  };
});

/** マイクロタスクと 0ms タイマーを流す。 */
async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

/** フェイクタイマーを ms ぶん進める。 */
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuth = { token: "t", user: { plan: "free" } };
  mockStartQuizSession.mockResolvedValue({ ok: true, id: "qs1", remainingToday: 2 });
  mockFinishQuizSession.mockResolvedValue({ ok: true, status: 200 });
  mockUkeireCalls.count = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TrainingScreen: 受け入れ詳細の再計算防止（useMemo）", () => {
  it("結果画面の再レンダー（もう一度挑戦の402失敗）で discardUkeires を再計算しない", async () => {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // Q1 を 9索・Q2 を 3萬 で回答して60秒経過 → 結果画面（受け入れ詳細2行分を計算）。
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.press(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();
    const calls = mockUkeireCalls.count;
    expect(calls).toBeGreaterThan(0); // 受け入れ詳細は計算されている

    // 「もう一度挑戦」が402で拒否される（starting/errorMsg の state 更新で結果画面が再レンダー）。
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    fireEvent.press(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(screen.getByText(/本日の無料枠/)).toBeTruthy();

    // 手牌は変わっていないので受け入れ計算は増えない。
    expect(mockUkeireCalls.count).toBe(calls);
  });
});
