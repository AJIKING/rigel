import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { makeDiscardPost, stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  getMyProblemsAction: vi.fn(),
  updateProblemAction: vi.fn(),
  deleteProblemAction: vi.fn(),
  setFavoriteAction: vi.fn(),
  getProblemDraftsAction: vi.fn(() => Promise.resolve([])),
  deleteProblemDraftAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// 一覧カードは牌譜一覧と同じ role=button + router.push 遷移（GameCard 共有）。
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MyProblemsScreen } from "./MyProblemsScreen";
import { ProblemListScreen } from "./ProblemListScreen";

function post(
  id: string,
  status: "draft" | "published" = "published",
  fav: { favoriteCount?: number; viewerFaved?: boolean } = {},
): ProblemPost {
  return makeDiscardPost({
    id,
    userId: "u1",
    title: `問題${id}`,
    status,
    favoriteCount: fav.favoriteCount ?? 0,
    viewerFaved: fav.viewerFaved ?? false,
  });
}

beforeEach(() => {
  push.mockReset();
  h.updateProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.setFavoriteAction.mockReset().mockResolvedValue({ ok: true, faved: true, favoriteCount: 1 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemListScreen（公開一覧。牌譜一覧と同じカードUI）", () => {
  it("公開問題のカードを出し、クリックで回答ページへ遷移する", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen initialCursor={null} initialPosts={[post("p1"), post("p2")]} />
      </AuthProvider>,
    );
    const card = await screen.findByRole("button", { name: /問題p1/ });
    fireEvent.click(card);
    expect(push).toHaveBeenCalledWith("/p/p1");
    expect(screen.getByText("問題p2")).toBeTruthy();
    expect(screen.getAllByText("何切る").length).toBeGreaterThan(0); // 出題形式バッジ
  });

  it("カードのサムネイルに理牌済み手牌＋ツモ牌を出す（内容が一覧で伝わる）", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen initialCursor={null} initialPosts={[post("p1")]} />
      </AuthProvider>,
    );
    await screen.findByText("問題p1");
    // makeDiscardPost の手牌13枚（1m..9m,1p..4p）＋ツモ牌 5p が牌画像で並ぶ。
    expect(screen.getAllByAltText("1萬")).toHaveLength(1);
    expect(screen.getAllByAltText("5筒")).toHaveLength(1); // ツモ牌
    expect(screen.getAllByAltText(/萬|筒|索/)).toHaveLength(14);
  });

  it("タイトルで検索できる（牌譜一覧と同じツールバー）", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <ProblemListScreen initialCursor={null} initialPosts={[post("p1"), post("p2")]} />
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
        <ProblemListScreen initialCursor={null} initialPosts={[]} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/まだ公開された問題がありません/)).toBeTruthy();
  });

  it("nextCursor がある間だけ「もっと見る」が出て、クリックで次ページを追記する", async () => {
    stubMe(null);
    const fetchPage = vi.fn().mockResolvedValue({ items: [post("p3")], nextCursor: null });
    render(
      <AuthProvider>
        <ProblemListScreen
          initialPosts={[post("p1"), post("p2")]}
          initialCursor="1000_p2"
          fetchPage={fetchPage}
        />
      </AuthProvider>,
    );
    const more = await screen.findByRole("button", { name: "もっと見る" });
    fireEvent.click(more);
    await waitFor(() => expect(screen.getByText("問題p3")).toBeTruthy());
    expect(fetchPage).toHaveBeenCalledWith("1000_p2");
    // 既存の表示は保たれ、最終ページに達したのでボタンは消える。
    expect(screen.getByText("問題p1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "もっと見る" })).toBeNull();
  });

  it("追加読み込みの失敗は一覧を保ったまま文言を出し、再試行できる", async () => {
    stubMe(null);
    const fetchPage = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ items: [post("p3")], nextCursor: null });
    render(
      <AuthProvider>
        <ProblemListScreen
          initialPosts={[post("p1")]}
          initialCursor="1000_p1"
          fetchPage={fetchPage}
        />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "もっと見る" }));
    await waitFor(() => expect(screen.getByText(/続きを読み込めませんでした/)).toBeTruthy());
    expect(screen.getByText("問題p1")).toBeTruthy(); // 表示中の一覧は保つ

    fireEvent.click(screen.getByRole("button", { name: "もっと見る" }));
    await waitFor(() => expect(screen.getByText("問題p3")).toBeTruthy());
    expect(screen.queryByText(/続きを読み込めませんでした/)).toBeNull();
  });

  it("牌譜一覧と同じ絞り込み（新着/人気/今週/お気に入り）ができる", async () => {
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
        <ProblemListScreen initialCursor={null} initialPosts={[old, recent]} />
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
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[post("p1", "draft"), post("p2", "published")]}
        />
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
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[post("p1", "draft"), post("p2", "published")]}
        />
      </AuthProvider>,
    );
    fireEvent.change(await screen.findByLabelText("状態で絞り込み"), {
      target: { value: "draft" },
    });
    expect(screen.getByText("問題p1")).toBeTruthy();
    expect(screen.queryByText("問題p2")).toBeNull();
  });

  it("カードのタップで編集画面へ。公開切替・編集・削除ボタンは一覧に出さない（編集画面に集約。[決定] 2026-08-08）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialCursor={null} initialPosts={[post("p1", "draft")]} />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByText("問題p1"));
    expect(push).toHaveBeenCalledWith("/problems/p1/edit");
    expect(screen.queryByRole("button", { name: "公開する" })).toBeNull();
    expect(screen.queryByRole("button", { name: "編集" })).toBeNull();
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("空のときは作成導線を出す", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialCursor={null} initialPosts={[]} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/まだ問題がありません/)).toBeTruthy();
  });

  it("ツールバーは牌譜タブと同じ構成（検索・状態・並び替え・お気に入り・新規）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen initialCursor={null} initialPosts={[post("p1")]} />
      </AuthProvider>,
    );
    expect(await screen.findByLabelText("問題を検索")).toBeTruthy();
    expect(screen.getByLabelText("状態で絞り込み")).toBeTruthy();
    const sort = screen.getByLabelText("並び替え") as HTMLSelectElement;
    expect(Array.from(sort.options).map((o) => o.textContent)).toEqual([
      "新しい順",
      "古い順",
      "お気に入りが多い順",
    ]);
    expect(screen.getByRole("button", { name: "お気に入りのみ表示", pressed: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新規" })).toBeTruthy();
  });

  it("「お気に入り」トグルは状態フィルタと掛け合わせられる（公開かつお気に入り）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[
            post("p1", "published", { viewerFaved: true }),
            post("p2", "published"),
            post("p3", "draft", { viewerFaved: true }),
          ]}
        />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "お気に入りのみ表示" }));
    expect(screen.getByText("問題p1")).toBeTruthy();
    expect(screen.queryByText("問題p2")).toBeNull();
    expect(screen.getByText("問題p3")).toBeTruthy();

    // さらに「公開」で絞ると下書きの p3 も落ちる。
    fireEvent.change(screen.getByLabelText("状態で絞り込み"), { target: { value: "published" } });
    expect(screen.getByText("問題p1")).toBeTruthy();
    expect(screen.queryByText("問題p3")).toBeNull();
  });

  it("「お気に入りが多い順」で並べ替えできる（局数順に代わる並び）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[
            post("p1", "published", { favoriteCount: 1 }),
            post("p2", "published", { favoriteCount: 8 }),
          ]}
        />
      </AuthProvider>,
    );
    fireEvent.change(await screen.findByLabelText("並び替え"), { target: { value: "fav" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h3) => h3.textContent)).toEqual([
      "問題p2",
      "問題p1",
    ]);
  });

  it("★を押すとサーバーへ保存し、件数と押下状態が即座に反映される", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[post("p1", "published", { favoriteCount: 4 })]}
        />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "お気に入り（4件）" }));
    await waitFor(() => expect(h.setFavoriteAction).toHaveBeenCalledWith("problem", "p1", true));
    // 楽観更新: 取り直さずに 5 件・押下状態になる。
    expect(screen.getByRole("button", { name: "お気に入り（5件）" }).getAttribute("aria-pressed")).toBe("true"); // prettier-ignore
  });

  it("★の保存に失敗したら押す前に戻し、注意を出す（黙って付いたことにしない）", async () => {
    stubMe("free");
    h.setFavoriteAction.mockResolvedValue({ ok: false, status: 404 });
    render(
      <AuthProvider>
        <MyProblemsScreen
          initialCursor={null}
          initialPosts={[post("p1", "published", { favoriteCount: 4 })]}
        />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "お気に入り（4件）" }));
    expect(await screen.findByText("お気に入りを更新できませんでした。")).toBeTruthy();
    expect(screen.getByRole("button", { name: "お気に入り（4件）" }).getAttribute("aria-pressed")).toBe("false"); // prettier-ignore
  });
});
