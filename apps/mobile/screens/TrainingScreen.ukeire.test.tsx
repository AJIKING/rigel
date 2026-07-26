// 結果画面の受け入れ詳細（UkeireDetail）の計算コスト検証（web の
// TrainingScreen.ukeire.test.tsx と同一挙動）。ukeireReviewModel（内部の discardUkeires が
// 14枚×34種の向聴総当たりで重い）を、手牌が変わらない再レンダー（例:「もう一度挑戦」失敗時の
// state 更新）で再計算しないこと（useMemo）を、@rigel/ui のモジュール境界スパイで固定する。
// スパイは実装をそのまま呼ぶ透過ラッパ（値の期待は TrainingScreen.test.tsx が保証）。
import type { EfficiencyQuestion } from "@rigel/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { TrainingScreen } from "./TrainingScreen";

// 出題は固定注入（seed 実測に依存しない。値の正しさは @rigel/ui のテストが担保）。
const EFFICIENCY_QS: readonly EfficiencyQuestion[] = [
  {
    kind: "efficiency",
    // prettier-ignore
    tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
    shanten: 2,
    answer: ["9s", "4z", "7z"],
  },
  {
    kind: "efficiency",
    // prettier-ignore
    tiles: ["3m", "4m", "4p", "5p", "6p", "8p", "7s", "8s", "9s", "2z", "3z", "3z", "6z", "7z"],
    shanten: 2,
    answer: ["2z", "6z", "7z"],
  },
];

let mockAuth: { token: string | null; user: { plan: string } | null; loading?: boolean };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockStartQuizSession = jest.fn();
const mockFinishQuizSession = jest.fn();
const mockListQuizSessions = jest.fn();
jest.mock("../lib/api", () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
  finishQuizSession: (...args: unknown[]) => mockFinishQuizSession(...args),
  listQuizSessions: (...args: unknown[]) => mockListQuizSessions(...args),
}));

// Firebase Analytics はネイティブモジュールなのでラッパごとモックする。
jest.mock("../lib/analytics", () => ({
  trackEvent: jest.fn(),
}));

/** TrainingScreen（コンポーネント側）からの ukeireReviewModel 呼び出し回数。
 *  packages/ui 内部（出題生成）の呼び出しはモジュール境界を通らないので数えない。 */
const mockUkeireCalls = { count: 0 };
jest.mock("@rigel/ui", () => {
  const orig = jest.requireActual("@rigel/ui");
  return {
    ...orig,
    ukeireReviewModel: (...args: unknown[]) => {
      mockUkeireCalls.count += 1;
      return orig.ukeireReviewModel(...args);
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
  mockListQuizSessions.mockResolvedValue([]);
  mockUkeireCalls.count = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TrainingScreen: 受け入れ詳細の再計算防止（useMemo）", () => {
  it("結果画面の再レンダー（もう一度挑戦の402失敗）で ukeireReviewModel を再計算しない", async () => {
    let i = 0;
    render(<TrainingScreen generateQuestion={() => EFFICIENCY_QS[i++ % EFFICIENCY_QS.length]!} />);
    // 新フロー: カード → 開始ダイアログ →「開始」→ 3秒カウントダウン → 第1問。
    fireEvent.press(screen.getByRole("button", { name: /^牌効率/ }));
    await flush();
    fireEvent.press(screen.getByRole("button", { name: "開始" }));
    await flush();
    await advance(3000);
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
