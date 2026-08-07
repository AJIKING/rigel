import type { QuizRankingDto } from "@rigel/client";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// サーバアクション既定値のスタブ（テストは fetchRanking 注入で差し替える）。
vi.mock("../../app/actions", () => ({ getQuizRankingAction: vi.fn() }));

import { RankingScreen } from "./RankingScreen";

function entry(over: Partial<QuizRankingDto["entries"][number]> = {}) {
  return {
    rank: 1,
    handle: "taro",
    displayName: "太郎",
    correct: 120,
    total: 200,
    accuracy: 0.6,
    score: 72, // 120 × 60%
    ...over,
  };
}

function dto(over: Partial<QuizRankingDto> = {}): QuizRankingDto {
  return {
    kind: "score",
    period: "weekly",
    entries: [
      entry(),
      entry({
        rank: 2,
        handle: "jiro",
        displayName: "次郎",
        correct: 90,
        total: 130,
        accuracy: 90 / 130,
        score: 90 * (90 / 130), // ≒ 62.3
      }),
    ],
    me: null,
    ...over,
  };
}

function renderScreen(initial: QuizRankingDto, fetchRanking = vi.fn()) {
  stubMe(null);
  render(
    <AuthProvider>
      <RankingScreen initial={initial} fetchRanking={fetchRanking} />
    </AuthProvider>,
  );
  return fetchRanking;
}

describe("RankingScreen（特訓ランキング。公開・単一スコアボード [決定] 2026-08-07）", () => {
  it("スコアボードに順位・表示名・内訳・スコアが並び、名前は /u/handle へリンクする", () => {
    renderScreen(dto());

    // スコアの定義注記は出さない（2026-08-08 オーナー削除依頼）。
    expect(screen.queryByText("スコア = 正解数 × 正答率")).toBeNull();

    const board = screen.getByRole("list", { name: "スコアランキング" });
    const rows = within(board).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("1")).toBeTruthy();
    const link = within(rows[0]!).getByRole("link", { name: "太郎" });
    expect(link.getAttribute("href")).toBe("/u/taro");
    expect(within(rows[0]!).getByText("120問・60%")).toBeTruthy(); // 内訳
    expect(within(rows[0]!).getByText("72.0")).toBeTruthy(); // スコア（小数1桁）
    expect(within(rows[1]!).getByText("62.3")).toBeTruthy();
  });

  it("種目・期間のセレクトで fetchRanking を呼び、応答でボードが入れ替わる（チップは廃止）", async () => {
    const next = dto({
      kind: "efficiency",
      entries: [entry({ handle: "hanako", displayName: "花子", correct: 55 })],
    });
    const fetchRanking = vi.fn().mockResolvedValue(next);
    renderScreen(dto(), fetchRanking);

    // 旧チップ（ボタン）は出さない（セレクトボックスへ置換。2026-08-08 オーナー）。
    expect(screen.queryByRole("button", { name: "牌効率" })).toBeNull();
    expect(screen.queryByRole("button", { name: "月間" })).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "種目" }), {
      target: { value: "efficiency" },
    });
    await act(async () => {});
    expect(fetchRanking).toHaveBeenCalledWith("efficiency", "weekly");
    expect(screen.getByRole("link", { name: "花子" })).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: "期間" }), {
      target: { value: "monthly" },
    });
    await act(async () => {});
    expect(fetchRanking).toHaveBeenLastCalledWith("efficiency", "monthly");
  });

  it("me があれば自分の順位（圏外含む）をスコアつきで上に出す", () => {
    renderScreen(
      dto({
        me: { rank: 123, correct: 10, total: 20, accuracy: 0.5, score: 5 },
      }),
    );
    expect(screen.getByText(/あなた:/)).toBeTruthy();
    expect(screen.getByText("123位")).toBeTruthy();
    expect(screen.getByText(/スコア 5\.0/)).toBeTruthy();
    expect(screen.getByText(/10問・50%/)).toBeTruthy();
  });

  it("記録が無ければ空状態の文言を出す", () => {
    renderScreen(dto({ entries: [] }));
    expect(screen.getByText("まだ記録がありません")).toBeTruthy();
  });

  it("初期取得失敗（initial=null）はエラー文言を出し、空ボードに偽装しない。セレクトで再取得できる", async () => {
    const fetchRanking = vi.fn().mockResolvedValue(dto());
    stubMe(null);
    render(
      <AuthProvider>
        <RankingScreen initial={null} fetchRanking={fetchRanking} />
      </AuthProvider>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/読み込めませんでした/);
    expect(screen.queryByText("まだ記録がありません")).toBeNull();

    fireEvent.change(screen.getByRole("combobox", { name: "期間" }), {
      target: { value: "monthly" },
    });
    await act(async () => {});
    expect(fetchRanking).toHaveBeenCalledWith("score", "monthly");
    expect(screen.getByRole("list", { name: "スコアランキング" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("切替の取得中は前の表示を保ったまま aria-busy で待ち、解決で戻る", async () => {
    let resolveFetch!: (d: QuizRankingDto) => void;
    const fetchRanking = vi.fn(
      () =>
        new Promise<QuizRankingDto>((res) => {
          resolveFetch = res;
        }),
    );
    renderScreen(dto(), fetchRanking);

    fireEvent.change(screen.getByRole("combobox", { name: "期間" }), {
      target: { value: "monthly" },
    });
    const boards = screen
      .getByRole("list", { name: "スコアランキング" })
      .closest("[aria-busy]") as HTMLElement;
    expect(boards.getAttribute("aria-busy")).toBe("true");
    // 前の表示は保たれている（真っ白にしない）。
    expect(screen.getByRole("link", { name: "太郎" })).toBeTruthy();

    await act(async () => resolveFetch(dto()));
    expect(boards.getAttribute("aria-busy")).toBe("false");
  });

  it("切替の取得失敗はエラー文言を出す（既存表示は保つ）", async () => {
    const fetchRanking = vi.fn().mockRejectedValue(new Error("network"));
    renderScreen(dto(), fetchRanking);
    fireEvent.change(screen.getByRole("combobox", { name: "期間" }), {
      target: { value: "monthly" },
    });
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/読み込めませんでした/);
    // 既存表示は保たれる。
    expect(screen.getByRole("link", { name: "太郎" })).toBeTruthy();
  });
});
