import type { QuizSessionDto } from "@rigel/client";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MyTrainingScreen } from "./MyTrainingScreen";

// now = JST 2026-07-24 12:00（テストの決定性のため注入。7d 窓 = JST 7/18〜7/24）。
const NOW = new Date("2026-07-24T03:00:00.000Z");

function mkSession(over: Partial<QuizSessionDto> = {}): QuizSessionDto {
  return {
    id: "s1",
    kind: "chinitsu",
    total: 10,
    correct: 7,
    durationMs: 60_000,
    createdAt: "2026-07-22T01:00:00.000Z", // JST 7/22 10:00
    ...over,
  };
}

// 清一色 何待ち2件（7d 窓内）＋牌効率1件（10日前 = 7d 窓外・30d 窓内）。
const SESSIONS: QuizSessionDto[] = [
  mkSession({ id: "s1", kind: "chinitsu", correct: 7, total: 10 }),
  mkSession({
    id: "s2",
    kind: "chinitsu",
    correct: 5,
    total: 10,
    createdAt: "2026-07-23T01:00:00.000Z",
  }),
  mkSession({
    id: "s3",
    kind: "efficiency",
    correct: 9,
    total: 10,
    createdAt: "2026-07-14T01:00:00.000Z",
  }),
];

function renderScreen(sessions: QuizSessionDto[] = SESSIONS) {
  stubMe("free");
  return render(
    <AuthProvider>
      <MyTrainingScreen initialSessions={sessions} now={NOW} />
    </AuthProvider>,
  );
}

/** グラフカード（種目名で引く）。記録が1日も無い種目のカードは存在しない。 */
function card(kindLabel: string): HTMLElement {
  return screen.getByRole("group", { name: kindLabel });
}

/** 並んでいるグラフカードの種目名（並び順の検証用。期間チップの group は拾わない）。 */
function cardLabels(): string[] {
  return screen
    .queryAllByTestId("board-meta")
    .map((el) => el.closest('[role="group"]')?.getAttribute("aria-label") ?? "");
}

/** 種目カード内の SVG 折れ線。 */
function chart(kindLabel: string): SVGElement {
  return within(card(kindLabel)).getByRole("img") as unknown as SVGElement;
}

/** グラフに打たれた点の数（記録のある日だけ＋終端の強調で1つ重ねる）。 */
function chartDotCount(kindLabel: string): number {
  return chart(kindLabel).querySelectorAll("circle").length;
}

/** 日付軸のラベル（最初/中央/最後。y 目盛りや値ラベルの数字は 'M/D' を含まないので除ける）。 */
function chartAxisDays(kindLabel: string): string[] {
  return [...chart(kindLabel).querySelectorAll("text")]
    .map((el) => el.textContent ?? "")
    .filter((s) => s.includes("/"));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyTrainingScreen: タブと全体構成", () => {
  it("マイページのタブは 牌譜 / 何切る / お気に入り / 特訓 の並びで、各タブのリンク先が正しい", () => {
    renderScreen();
    const tabs = screen.getByRole("navigation", { name: "マイページの切替" });
    const links = within(tabs).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["牌譜", "何切る", "お気に入り", "特訓"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/mypage",
      "/mypage/problems",
      "/mypage/favorites",
      "/mypage/training",
    ]);
  });

  // 1分あたり正解数は種目ごとに1問の重さが違うので、混ぜた合算は「上達」を表さない。
  // 種目をまたいだサマリも合算チップも置かない（[決定] 2026-07-27 オーナー）。
  it("全種目をまとめたサマリ枠も「全種目」チップも無い（種目をまたいだ合算を見せない）", () => {
    renderScreen();
    expect(screen.queryByText("挑戦回数")).toBeNull();
    expect(screen.queryByText("自己ベスト")).toBeNull();
    expect(screen.queryByText("平均正答率")).toBeNull();
    expect(screen.queryByRole("button", { name: "全種目" })).toBeNull();
    expect(screen.queryByRole("group", { name: "種目で絞り込み" })).toBeNull();
  });

  it("切替は期間チップだけ（7日/30日/全期間）", () => {
    renderScreen();
    const periods = screen.getByRole("group", { name: "期間切替" });
    expect(
      within(periods)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["7日", "30日", "全期間"]);
  });
});

describe("MyTrainingScreen: 種目ごとのグラフ", () => {
  it("記録のある種目だけを、種目カードと同じ並びで並べる", () => {
    renderScreen();
    // 7d 窓の記録は清一色 何待ちだけ（牌効率は10日前）。
    expect(cardLabels()).toEqual(["清一色 何待ち"]);

    // 30日に広げると牌効率も入り、背骨の並び（牌効率 → 清一色 何待ち）で並ぶ。
    fireEvent.click(screen.getByRole("button", { name: "30日" }));
    expect(cardLabels()).toEqual(["牌効率", "清一色 何待ち"]);
  });

  it("各カードにその種目・その期間のサマリ（回数・ベスト・正答率）が出る", () => {
    renderScreen();
    const meta = within(card("清一色 何待ち")).getByTestId("board-meta").textContent;
    expect(meta).toContain("2回");
    expect(meta).toContain("ベスト 7");
    expect(meta).toContain("正答率 60%");
  });

  it("指標名は上に1度だけ出す（カードごとに繰り返さない）", () => {
    renderScreen();
    expect(screen.getAllByText("1分あたり正解数の推移")).toHaveLength(1);
  });

  it("グラフの日付軸は既定で直近7日。30日 → 6/25〜7/24、全期間 → 最古(7/14)〜now", () => {
    renderScreen();
    expect(chartAxisDays("清一色 何待ち")).toEqual(["7/18", "7/21", "7/24"]);

    fireEvent.click(screen.getByRole("button", { name: "30日" }));
    expect(chartAxisDays("清一色 何待ち")).toEqual(["6/25", "7/9", "7/24"]);

    fireEvent.click(screen.getByRole("button", { name: "全期間" }));
    expect(chartAxisDays("清一色 何待ち")).toEqual(["7/14", "7/19", "7/24"]);

    fireEvent.click(screen.getByRole("button", { name: "7日" }));
    expect(chartAxisDays("清一色 何待ち")).toEqual(["7/18", "7/21", "7/24"]);
  });

  // 並べたグラフを見比べるには横軸が揃っている必要がある。
  it("全期間でも全カードの日付軸が揃う（種目ごとの最古から始めない）", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "全期間" }));
    expect(chartAxisDays("牌効率")).toEqual(chartAxisDays("清一色 何待ち"));
  });

  it("点は記録のある日だけに打つ（欠損日を 0 埋めしない）。終端は強調でもう1つ重ねる", () => {
    renderScreen();
    // 7d 窓（7/18〜7/24）の清一色の記録は 7/22・7/23 の2日 → 2点 + 終端の強調1点。
    expect(chartDotCount("清一色 何待ち")).toBe(3);
  });

  it("期間内に記録が1件も無ければグラフを1枚も出さない（0 の平坦な線を見せない）", () => {
    // 全記録が 7d 窓の外。
    renderScreen([SESSIONS[2]!]);
    expect(cardLabels()).toEqual([]);
    expect(screen.queryByText("1分あたり正解数の推移")).toBeNull();
  });

  it("グラフはキーボードで各日の値を読める（左右キーでツールチップが動く）", () => {
    renderScreen();
    const svg = chart("清一色 何待ち");
    // 既定は最新の記録日（7/23 = 5問/分）から。右キーで 7/24（記録なし）へ。
    fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toBe("7/24—");
    fireEvent.keyDown(svg, { key: "ArrowLeft" });
    expect(screen.getByRole("status").textContent).toBe("7/235");
  });
});

describe("MyTrainingScreen: 履歴リスト", () => {
  it("履歴は全種目まとめて時系列（日時(JST)・種目・スコア・正答率）", () => {
    renderScreen();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    // 先頭 = 一番新しい s2（JST 7/23 10:00・5/10）。
    expect(rows[0]!.textContent).toContain("2026/07/23 10:00");
    expect(rows[0]!.textContent).toContain("清一色 何待ち");
    expect(rows[0]!.textContent).toContain("5 / 10問");
    expect(rows[0]!.textContent).toContain("正答率 50%");
    // 末尾 = 一番古い s3（牌効率・9/10）。期間で絞らない。
    expect(rows[2]!.textContent).toContain("牌効率");
    expect(rows[2]!.textContent).toContain("正答率 90%");
  });

  it("履歴は直近20件まで", () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      mkSession({
        id: `m${i}`,
        createdAt: `2026-07-${String(1 + (i % 20)).padStart(2, "0")}T01:00:00.000Z`,
      }),
    );
    renderScreen(many);
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
  });

  it("出題 0 問のセッションは正答率を —（null）で出す", () => {
    renderScreen([mkSession({ correct: 0, total: 0 })]);
    const row = screen.getByRole("listitem");
    expect(row.textContent).toContain("0 / 0問");
    expect(row.textContent).toContain("正答率 —");
  });

  it("記録が無ければ空状態は短い1文（共有文言）", () => {
    renderScreen([]);
    expect(screen.getByText("まだ特訓の記録がありません")).toBeTruthy();
  });
});
