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

// 清一色2件（7d 窓内）＋牌効率1件（10日前 = 7d 窓外・30d 窓内）。
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

/** サマリ1枠のテキスト（<b>値</b><span>ラベル</span> の親を丸ごと読む）。 */
function statText(label: string): string {
  return screen.getByText(label).parentElement?.textContent ?? "";
}

/** グラフ（SVG 折れ線）の点の数。 */
function chartPointCount(): number {
  const svg = screen.getByRole("img", { name: "1分あたり正解数の推移" });
  return svg.querySelectorAll("circle").length;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyTrainingScreen: タブとサマリ", () => {
  it("マイページのタブは 牌譜 / 何切る / 特訓 の並びで、特訓が /mypage/training を指す", () => {
    renderScreen();
    const tabs = screen.getByRole("navigation", { name: "マイページの切替" });
    const links = within(tabs).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["牌譜", "何切る", "特訓"]);
    expect(links[2]!.getAttribute("href")).toBe("/mypage/training");
  });

  it("サマリに挑戦回数・自己ベスト・平均正答率（正解合計/出題合計）が stat カードで出る", () => {
    renderScreen();
    expect(statText("挑戦回数")).toBe("3挑戦回数");
    expect(statText("自己ベスト")).toBe("9自己ベスト");
    expect(statText("平均正答率")).toBe("70%平均正答率");
  });

  it("記録が無ければサマリは 0 /—、空状態は短い1文（共有文言）が出る", () => {
    renderScreen([]);
    expect(statText("挑戦回数")).toBe("0挑戦回数");
    expect(statText("平均正答率")).toBe("—平均正答率");
    expect(screen.getByText("まだ特訓の記録がありません")).toBeTruthy();
  });
});

describe("MyTrainingScreen: 期間・種目の切替", () => {
  it("グラフは既定で直近7日（7点）。30日 → 30点、全期間 → 最古(7/14)〜now の11点", () => {
    renderScreen();
    // グラフカードには小ラベル「1分あたり正解数」を出す。
    expect(screen.getByText("1分あたり正解数")).toBeTruthy();
    expect(chartPointCount()).toBe(7);

    fireEvent.click(screen.getByRole("button", { name: "30日" }));
    expect(chartPointCount()).toBe(30);

    fireEvent.click(screen.getByRole("button", { name: "全期間" }));
    expect(chartPointCount()).toBe(11);

    fireEvent.click(screen.getByRole("button", { name: "7日" }));
    expect(chartPointCount()).toBe(7);
  });

  it("種目チップ（全種目/清一色/牌効率）で清一色に絞るとサマリと履歴から牌効率の分が消える", () => {
    renderScreen();
    // 絞る前: 牌効率の行（正答率 90%）があり、チップの既定は「全種目」。
    const before = screen.getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(before.some((r) => r.includes("牌効率（受け入れ最大）"))).toBe(true);
    const kinds = screen.getByRole("group", { name: "種目で絞り込み" });
    expect(within(kinds).getByRole("button", { name: "全種目" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    fireEvent.click(within(kinds).getByRole("button", { name: "清一色" }));
    expect(within(kinds).getByRole("button", { name: "清一色" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(statText("挑戦回数")).toBe("2挑戦回数");
    expect(statText("自己ベスト")).toBe("7自己ベスト");
    expect(statText("平均正答率")).toBe("60%平均正答率");
    const rows = screen.getAllByRole("listitem").map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.includes("清一色 多面待ち"))).toBe(true);
    expect(rows.some((r) => r.includes("牌効率（受け入れ最大）"))).toBe(false);
  });
});

describe("MyTrainingScreen: 履歴リスト", () => {
  it("履歴行に 日時(JST)・種目・スコア・正答率 が新しい順で出る", () => {
    renderScreen();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    // 先頭 = 一番新しい s2（JST 7/23 10:00・5/10）。
    expect(rows[0]!.textContent).toContain("2026/07/23 10:00");
    expect(rows[0]!.textContent).toContain("清一色 多面待ち");
    expect(rows[0]!.textContent).toContain("5 / 10問");
    expect(rows[0]!.textContent).toContain("正答率 50%");
    // 末尾 = 一番古い s3（牌効率・9/10）。
    expect(rows[2]!.textContent).toContain("牌効率（受け入れ最大）");
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
});
