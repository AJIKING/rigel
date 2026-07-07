import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Tile } from "@rigel/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";

const h = vi.hoisted(() => ({
  getMyProblemsAction: vi.fn(),
  updateProblemAction: vi.fn(),
  deleteProblemAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// AppHeader が useRouter を使う（アバター→設定遷移）ためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MyProblemsScreen } from "./MyProblemsScreen";
import { ProblemListScreen } from "./ProblemListScreen";

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

function post(id: string, status: "draft" | "published" = "published"): ProblemPost {
  return {
    id,
    userId: "u1",
    title: `問題${id}`,
    status,
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
      answer: { type: "discard", tile: "5p" },
    }),
  };
}

function stubMe(plan: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: plan ? { id: "u1", plan } : null }),
    })),
  );
}

beforeEach(() => {
  h.updateProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemListScreen（公開一覧）", () => {
  it("公開問題のカードを出し、回答ページへリンクする", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen posts={[post("p1"), post("p2")]} />
      </AuthProvider>,
    );
    const card = await screen.findByText("問題p1");
    expect(card.closest("a")?.getAttribute("href")).toBe("/p/p1");
    expect(screen.getByText("問題p2")).toBeTruthy();
    expect(screen.getAllByText("何切る")[0]).toBeTruthy(); // 出題形式ラベル
  });

  it("空のときは案内を出す", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen posts={[]} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/まだ公開された問題がありません/)).toBeTruthy();
  });
});

describe("MyProblemsScreen（マイ何切る）", () => {
  it("draft/published バッジと free のクォータ（n/20問）を出す", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[post("p1", "draft"), post("p2", "published")]} />
      </AuthProvider>,
    );
    expect(await screen.findByText("下書き")).toBeTruthy();
    expect(screen.getByText("公開中")).toBeTruthy();
    expect(await screen.findByText(/2\s*\/\s*20問/)).toBeTruthy();
  });

  it("公開切替で updateProblemAction(status) を呼ぶ", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[post("p1", "draft")]} />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "公開する" }));
    await waitFor(() =>
      expect(h.updateProblemAction).toHaveBeenCalledWith("p1", { status: "published" }),
    );
  });

  it("削除は2度押しで確定（誤操作防止）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[post("p1", "draft")]} />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "削除" }));
    expect(h.deleteProblemAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "もう一度押して削除" }));
    await waitFor(() => expect(h.deleteProblemAction).toHaveBeenCalledWith("p1"));
  });

  it("空のときは作成導線を出す", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[]} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/まだ問題がありません/)).toBeTruthy();
  });
});
