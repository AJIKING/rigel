import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Tile } from "@rigel/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";

const h = vi.hoisted(() => ({
  answerProblemAction: vi.fn(),
  getProblemStatsAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);

import { ProblemAnswerScreen } from "./ProblemAnswerScreen";

const HAND_13: Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
];

function discardPost(): ProblemPost {
  return {
    id: "p1",
    userId: "owner",
    title: "何を切る？",
    status: "published",
    createdAt: "2026-07-07T00:00:00.000Z",
    problem: ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "discard",
      pov: "east",
      drawn: "5p",
      seats: {
        east: { hand: HAND_13.map((t) => ({ tile: t, confidence: 1 })) },
        south: {},
        west: {},
        north: {},
      },
      answer: { type: "discard", tile: "1m", riichi: true },
      explanation: "ピンズの伸びを見て字牌側から整理する。",
    }),
  };
}

function callPost(): ProblemPost {
  return {
    ...discardPost(),
    id: "p2",
    problem: ProblemSchema.parse({
      schemaVersion: PROBLEM_SCHEMA_VERSION,
      kind: "call",
      pov: "east",
      targetSeat: "south",
      seats: {
        east: { hand: HAND_13.map((t) => ({ tile: t, confidence: 1 })) },
        south: { river: [{ order: 1, tile: "5p", confidence: 1 }] },
        west: {},
        north: {},
      },
      answer: { type: "pass" },
      explanation: "門前を崩さない。",
    }),
  };
}

/** /api/me をスタブ（AuthProvider が起動時に読む）。plan=null で未ログイン。 */
function stubMe(plan: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: plan ? { id: "u1", plan } : null }),
    })),
  );
}

function renderScreen(post: ProblemPost) {
  return render(
    <AuthProvider>
      <ProblemAnswerScreen post={post} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  h.answerProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.getProblemStatsAction.mockReset().mockResolvedValue({
    counts: { "discard:1m:riichi": 2, "discard:5p": 1 },
    total: 3,
    myChoiceKey: "discard:1m:riichi",
    myAction: { type: "discard", tile: "1m", riichi: true },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemAnswerScreen: 何切る", () => {
  it("回答前は出題者の答え・解説を出さない", async () => {
    stubMe("free");
    renderScreen(discardPost());
    expect(await screen.findByText("何を切る？")).toBeTruthy();
    expect(screen.queryByText(/出題者の答え/)).toBeNull();
    expect(screen.queryByText(/ピンズの伸び/)).toBeNull();
  });

  it("牌を選びリーチを付けて回答すると、答え・解説・分布（ログイン時）が出る", async () => {
    stubMe("free");
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "リーチ" }));
    fireEvent.click(screen.getByRole("button", { name: "1萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));

    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p1", {
        type: "discard",
        tile: "1m",
        riichi: true,
      }),
    );
    expect(await screen.findByText(/出題者の答え/)).toBeTruthy();
    // 自分の回答・出題者の答え・分布に同じラベルが出る（正解一致のケース）。
    expect(screen.getAllByText(/1萬切り・リーチ/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ピンズの伸び/)).toBeTruthy();
    // 分布（choiceKey→ラベル・割合）
    expect(await screen.findByText(/回答分布/)).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("未ログインでも回答体験はできるが、集計は呼ばずログイン導線を出す", async () => {
    stubMe(null);
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "5筒" })); // ツモ切り
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));

    expect(await screen.findByText(/出題者の答え/)).toBeTruthy();
    expect(h.answerProblemAction).not.toHaveBeenCalled();
    expect(screen.getByText(/ログインすると回答分布/)).toBeTruthy();
  });

  it("牌を選ぶまで回答ボタンは無効", async () => {
    stubMe("free");
    renderScreen(discardPost());
    const btn = (await screen.findByRole("button", { name: "回答する" })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("ProblemAnswerScreen: 鳴き判断", () => {
  it("スルー/ポン/チー/カンの選択式。スルーはそのまま回答できる", async () => {
    stubMe("free");
    renderScreen(callPost());
    fireEvent.click(await screen.findByRole("button", { name: "スルー" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() => expect(h.answerProblemAction).toHaveBeenCalledWith("p2", { type: "pass" }));
  });

  it("ポンを選ぶと切る牌の選択に進み、選んで回答できる", async () => {
    stubMe("free");
    renderScreen(callPost());
    fireEvent.click(await screen.findByRole("button", { name: "ポン" }));
    // 切る牌を選ぶまでは回答できない。
    expect((screen.getByRole("button", { name: "回答する" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "2萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p2", {
        type: "call",
        call: "pon",
        discard: "2m",
      }),
    );
  });
});
