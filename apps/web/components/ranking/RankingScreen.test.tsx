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

function entry(over: Partial<QuizRankingDto["correct"][number]> = {}) {
  return {
    rank: 1,
    handle: "taro",
    displayName: "太郎",
    correct: 120,
    total: 200,
    accuracy: 0.6,
    ...over,
  };
}

function dto(over: Partial<QuizRankingDto> = {}): QuizRankingDto {
  return {
    kind: "score",
    period: "weekly",
    correct: [
      entry(),
      entry({
        rank: 2,
        handle: "jiro",
        displayName: "次郎",
        correct: 90,
        total: 100,
        accuracy: 0.9,
      }),
    ],
    accuracy: [
      entry({
        rank: 1,
        handle: "jiro",
        displayName: "次郎",
        correct: 90,
        total: 100,
        accuracy: 0.9,
      }),
      entry({
        rank: 2,
        handle: "taro",
        displayName: "太郎",
        correct: 120,
        total: 200,
        accuracy: 0.6,
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

describe("RankingScreen（特訓ランキング。公開・2ボード）", () => {
  it("正解数・正答率の2ボードに順位・表示名・値が並び、名前は /u/handle へリンクする", () => {
    renderScreen(dto());

    const correct = screen.getByRole("list", { name: "正解数ランキング" });
    const rows = within(correct).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("1")).toBeTruthy();
    const link = within(rows[0]!).getByRole("link", { name: "太郎" });
    expect(link.getAttribute("href")).toBe("/u/taro");
    expect(within(rows[0]!).getByText("120問")).toBeTruthy();

    const accuracy = screen.getByRole("list", { name: "正答率ランキング" });
    const aRows = within(accuracy).getAllByRole("listitem");
    expect(within(aRows[0]!).getByRole("link", { name: "次郎" })).toBeTruthy();
    expect(within(aRows[0]!).getByText("90%")).toBeTruthy();
    // 正答率ボードにはしきい値の注記。
    expect(screen.getByText("50問以上回答した人が対象")).toBeTruthy();
  });

  it("種目・期間チップの切替で fetchRanking を呼び、応答でボードが入れ替わる", async () => {
    const next = dto({
      kind: "efficiency",
      correct: [entry({ handle: "hanako", displayName: "花子", correct: 55 })],
      accuracy: [],
    });
    const fetchRanking = vi.fn().mockResolvedValue(next);
    renderScreen(dto(), fetchRanking);

    fireEvent.click(screen.getByRole("button", { name: "牌効率" }));
    await act(async () => {});
    expect(fetchRanking).toHaveBeenCalledWith("efficiency", "weekly");
    expect(screen.getByRole("link", { name: "花子" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "月間" }));
    await act(async () => {});
    expect(fetchRanking).toHaveBeenLastCalledWith("efficiency", "monthly");
  });

  it("me があれば自分の順位（圏外・正答率対象外も含む）を上に出す", () => {
    renderScreen(
      dto({
        me: { correctRank: 123, accuracyRank: null, correct: 10, total: 20, accuracy: 0.5 },
      }),
    );
    expect(screen.getByText(/あなた:/)).toBeTruthy();
    expect(screen.getByText("123位")).toBeTruthy();
    expect(screen.getByText(/対象外（50問以上で掲載）/)).toBeTruthy();
  });

  it("記録が無いボードは空状態の文言を出す", () => {
    renderScreen(dto({ correct: [], accuracy: [] }));
    expect(screen.getAllByText("まだ記録がありません")).toHaveLength(2);
  });

  it("初期取得失敗（initial=null）はエラー文言を出し、空ボードに偽装しない。チップで再取得できる", async () => {
    const fetchRanking = vi.fn().mockResolvedValue(dto());
    stubMe(null);
    render(
      <AuthProvider>
        <RankingScreen initial={null} fetchRanking={fetchRanking} />
      </AuthProvider>,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/読み込めませんでした/);
    expect(screen.queryByText("まだ記録がありません")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "月間" }));
    await act(async () => {});
    expect(fetchRanking).toHaveBeenCalledWith("score", "monthly");
    expect(screen.getByRole("list", { name: "正解数ランキング" })).toBeTruthy();
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

    fireEvent.click(screen.getByRole("button", { name: "月間" }));
    const boards = screen
      .getByRole("list", { name: "正解数ランキング" })
      .closest("[aria-busy]") as HTMLElement;
    expect(boards.getAttribute("aria-busy")).toBe("true");
    // 前の表示は保たれている（真っ白にしない）。
    expect(screen.getAllByRole("link", { name: "太郎" }).length).toBeGreaterThan(0);

    await act(async () => resolveFetch(dto()));
    expect(boards.getAttribute("aria-busy")).toBe("false");
  });

  it("切替の取得失敗はエラー文言を出す（既存表示は保つ）", async () => {
    const fetchRanking = vi.fn().mockRejectedValue(new Error("network"));
    renderScreen(dto(), fetchRanking);
    fireEvent.click(screen.getByRole("button", { name: "月間" }));
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/読み込めませんでした/);
    // 既存表示は保たれる（太郎は正解数・正答率の両ボードに載っている）。
    expect(screen.getAllByRole("link", { name: "太郎" }).length).toBeGreaterThan(0);
  });
});
