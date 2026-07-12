import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { makeDiscardPost, stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  getMyProblemsAction: vi.fn(),
  updateProblemAction: vi.fn(),
  deleteProblemAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// 一覧カードは牌譜一覧と同じ role=button + router.push 遷移（GameCard 共有）。
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MyProblemsScreen } from "./MyProblemsScreen";
import { ProblemListScreen } from "./ProblemListScreen";

function post(id: string, status: "draft" | "published" = "published"): ProblemPost {
  return makeDiscardPost({ id, userId: "u1", title: `問題${id}`, status });
}

beforeEach(() => {
  push.mockReset();
  h.updateProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemListScreen（公開一覧。牌譜一覧と同じカードUI）", () => {
  it("公開問題のカードを出し、クリックで回答ページへ遷移する", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen posts={[post("p1"), post("p2")]} />
      </AuthProvider>,
    );
    const card = await screen.findByRole("button", { name: /問題p1/ });
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/p/p1");
    expect(screen.getByText("問題p2")).toBeTruthy();
    expect(screen.getAllByText("何切る").length).toBeGreaterThan(0); // 出題形式バッジ
  });

  it("タイトルで検索できる（牌譜一覧と同じツールバー）", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen posts={[post("p1"), post("p2")]} />
      </AuthProvider>,
    );
    fireEvent.change(await screen.findByLabelText("何切る問題を検索"), {
      target: { value: "問題p2" },
    });
    expect(screen.queryByText("問題p1")).toBeNull();
    expect(screen.getByText("問題p2")).toBeTruthy();
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

  it("牌譜一覧と同じ絞り込み（新着/今週/お気に入り）ができる", async () => {
    stubMe(null);
    const day = 24 * 3600 * 1000;
    const old = {
      ...post("old"),
      title: "古い問題",
      createdAt: new Date(Date.now() - 10 * day).toISOString(),
    };
    const recent = { ...post("new"), title: "今週の問題", createdAt: new Date().toISOString() };
    render(
      <AuthProvider>
        <ProblemListScreen posts={[old, recent]} />
      </AuthProvider>,
    );
    expect(await screen.findByText("古い問題")).toBeTruthy();

    const select = screen.getByLabelText("並び替え") as HTMLSelectElement;
    // 今週: 直近7日の問題だけ。
    fireEvent.change(select, { target: { value: "week" } });
    expect(screen.queryByText("古い問題")).toBeNull();
    expect(screen.getByText("今週の問題")).toBeTruthy();

    // お気に入り: まだ無いので専用の空文言。
    fireEvent.change(select, { target: { value: "fav" } });
    expect(screen.getByText(/お気に入りした問題がまだありません/)).toBeTruthy();

    // 新着で全件へ戻る。
    fireEvent.change(select, { target: { value: "new" } });
    expect(screen.getByText("古い問題")).toBeTruthy();
    expect(screen.getByText("今週の問題")).toBeTruthy();
  });
});

describe("MyProblemsScreen（マイ何切る。牌譜マイページと同じ構造）", () => {
  it("統計・draft/published バッジ・free のクォータ（n/20問）を出す", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[post("p1", "draft"), post("p2", "published")]} />
      </AuthProvider>,
    );
    // 「下書き/公開」は統計とバッジの両方に出る（牌譜マイページと同じ構造）。
    expect((await screen.findAllByText("下書き")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("公開").length).toBeGreaterThan(0);
    expect(await screen.findByText(/2\s*\/\s*20問/)).toBeTruthy();
  });

  it("状態で絞り込みできる", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialPosts={[post("p1", "draft"), post("p2", "published")]} />
      </AuthProvider>,
    );
    fireEvent.change(await screen.findByLabelText("状態で絞り込み"), {
      target: { value: "draft" },
    });
    expect(screen.getByText("問題p1")).toBeTruthy();
    expect(screen.queryByText("問題p2")).toBeNull();
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
