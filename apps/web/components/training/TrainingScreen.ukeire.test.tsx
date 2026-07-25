// 結果画面の受け入れ詳細（UkeireDetail）の計算コスト検証。
// discardUkeires は 14枚×34種の向聴総当たりで重い（15問で約100ms超）ため、
// 手牌が変わらない再レンダー（例:「もう一度挑戦」失敗時の state 更新）で
// 再計算しないこと（useMemo）を、@rigel/ui のモジュール境界スパイで固定する。
// スパイは実装をそのまま呼ぶ透過ラッパ（値の期待は TrainingScreen.test.tsx が保証）。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({
  startQuizSessionAction: vi.fn(),
  finishQuizSessionAction: vi.fn(),
  /** TrainingScreen（コンポーネント側）からの discardUkeires 呼び出し回数。
   *  packages/ui 内部（出題生成）の呼び出しはモジュール境界を通らないので数えない。 */
  ukeireCalls: { count: 0 },
}));
vi.mock("../../app/actions", () => ({
  startQuizSessionAction: h.startQuizSessionAction,
  finishQuizSessionAction: h.finishQuizSessionAction,
}));
// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@rigel/ui", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@rigel/ui")>();
  return {
    ...orig,
    discardUkeires: (...args: Parameters<typeof orig.discardUkeires>) => {
      h.ukeireCalls.count += 1;
      return orig.discardUkeires(...args);
    },
  };
});

import { TrainingScreen } from "./TrainingScreen";

/** マイクロタスクと 0ms タイマーを流す。 */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** フェイクタイマーを ms ぶん進める。 */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.startQuizSessionAction.mockReset().mockResolvedValue({
    ok: true,
    id: "qs1",
    remainingToday: 2,
  });
  h.finishQuizSessionAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.ukeireCalls.count = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TrainingScreen: 受け入れ詳細の再計算防止（useMemo）", () => {
  it("結果画面の再レンダー（もう一度挑戦の402失敗）で discardUkeires を再計算しない", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <TrainingScreen seed={1} />
      </AuthProvider>,
    );
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // Q1 を 9索・Q2 を 3萬 で回答して60秒経過 → 結果画面（受け入れ詳細2行分を計算）。
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();
    const calls = h.ukeireCalls.count;
    expect(calls).toBeGreaterThan(0); // 受け入れ詳細は計算されている

    // 「もう一度挑戦」が402で拒否される（starting/errorMsg の state 更新で結果画面が再レンダー）。
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(screen.getByText(/本日の無料枠/)).toBeTruthy();

    // 手牌は変わっていないので受け入れ計算は増えない。
    expect(h.ukeireCalls.count).toBe(calls);
  });
});
