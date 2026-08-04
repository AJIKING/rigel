import type { QuizSessionDetailDto } from "@rigel/client";
import { jstDateTime } from "@rigel/ui";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TrainingSessionScreen } from "./TrainingSessionScreen";

function detail(over: Partial<QuizSessionDetailDto> = {}): QuizSessionDetailDto {
  return {
    id: "qs1",
    kind: "efficiency",
    total: 2,
    correct: 1,
    durationMs: 60_000,
    createdAt: "2026-07-24T03:05:00.000Z", // JST 7/24 12:05
    records: null,
    ...over,
  };
}

/** 牌効率レコード2件（1問目○・2問目×。手牌は結果画面テストと同じフィクスチャ）。 */
const RECORDS: QuizSessionDetailDto["records"] = [
  {
    question: {
      kind: "efficiency",
      // prettier-ignore
      tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
      shanten: 2,
      answer: ["9s", "4z", "7z"],
    },
    picked: ["9s"],
    ok: true,
  },
  {
    question: {
      kind: "efficiency",
      // prettier-ignore
      tiles: ["3m", "4m", "4p", "5p", "6p", "8p", "7s", "8s", "9s", "2z", "3z", "3z", "6z", "7z"],
      shanten: 2,
      answer: ["2z", "6z", "7z"],
    },
    picked: ["3m"],
    ok: false,
  },
];

function renderScreen(dto: QuizSessionDetailDto) {
  stubMe("free");
  return render(
    <AuthProvider>
      <TrainingSessionScreen session={dto} />
    </AuthProvider>,
  );
}

describe("TrainingSessionScreen（特訓セッション詳細）", () => {
  it("種目・日時・スコアと、保存された見直しレコード（結果画面と同じ行構造）を出す", () => {
    renderScreen(detail({ records: RECORDS }));

    expect(screen.getByText("牌効率")).toBeTruthy();
    // 日時表記は履歴リストと同じ jstDateTime（書式はそちらのテストが担保）。
    expect(screen.getByText(jstDateTime("2026-07-24T03:05:00.000Z"))).toBeTruthy();
    expect(screen.getByText("正解 1問")).toBeTruthy();
    expect(screen.getByText("出題 2問")).toBeTruthy();
    expect(screen.getByText("正答率 50%")).toBeTruthy();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("○")).toBeTruthy();
    expect(within(rows[1]!).getByText("×")).toBeTruthy();
    // 受け入れ詳細（牌効率の見直し）も結果画面と同じく出る。
    expect(within(rows[0]!).getByRole("group", { name: "あなたの回答の受け入れ" })).toBeTruthy();
    // 有料表示なので案内は出ない。
    expect(screen.queryByText(/有料プランの機能/)).toBeNull();
  });

  it("records=null（無料・ダウングレード）は案内＋プラン導線を出し、見直しリストは出さない", () => {
    renderScreen(detail({ records: null }));

    expect(screen.getByText(/見直しの保存・閲覧は有料プランの機能です/)).toBeTruthy();
    const plan = screen.getByRole("link", { name: "プランを見る" });
    expect(plan.getAttribute("href")).toBe("/settings");
    expect(screen.queryByRole("list", { name: "見直しリスト" })).toBeNull();
  });

  it("特訓の記録一覧（/mypage/training）への戻り導線がある", () => {
    renderScreen(detail());
    const back = screen.getByRole("link", { name: /特訓の記録/ });
    expect(back.getAttribute("href")).toBe("/mypage/training");
  });
});
