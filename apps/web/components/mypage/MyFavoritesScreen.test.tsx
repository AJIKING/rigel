import type { FavoriteGameCard, FavoriteProblemCard } from "@rigel/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { makeDiscardPost, stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({ setFavoriteAction: vi.fn(), getMyFavoritesAction: vi.fn() }));
vi.mock("../../app/actions", () => h);
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MyFavoritesScreen } from "./MyFavoritesScreen";

function game(id: string, over: Partial<FavoriteGameCard> = {}): FavoriteGameCard {
  return {
    id,
    ownerId: "other",
    ownerHandle: "taro",
    ownerName: "太郎",
    title: `半荘${id}`,
    createdAt: "2026-07-20T00:00:00.000Z",
    kyokuCount: 4,
    firstLogId: `${id}-l1`,
    favoriteCount: 1,
    viewerFaved: true,
    mine: false,
    ...over,
  };
}

function problem(id: string, over: Partial<FavoriteProblemCard> = {}): FavoriteProblemCard {
  return {
    ...makeDiscardPost({ id, userId: "other", title: `問題${id}`, status: "published" }),
    favoriteCount: 1,
    viewerFaved: true,
    mine: false,
    ownerHandle: "taro",
    ownerName: "太郎",
    ...over,
  };
}

function renderScreen(games: FavoriteGameCard[], problems: FavoriteProblemCard[]) {
  stubMe("free");
  return render(
    <AuthProvider>
      <MyFavoritesScreen initialCursor={null} initialGames={games} initialProblems={problems} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  h.setFavoriteAction.mockReset().mockResolvedValue({ ok: true, faved: false, favoriteCount: 0 });
});

describe("MyFavoritesScreen（マイページ お気に入りタブ）", () => {
  it("牌譜と何切るを1か所に並べる（他人の投稿も自分の投稿も）", async () => {
    renderScreen([game("g1"), game("g2", { mine: true, ownerId: "me" })], [problem("p1")]);
    expect(await screen.findByText("半荘g1")).toBeTruthy();
    expect(screen.getByText("半荘g2")).toBeTruthy();
    expect(screen.getByText("問題p1")).toBeTruthy();
  });

  it("「お気に入りのみ」トグルは出さない（このタブは常にお気に入りだけなので無意味。mobile と統一）", async () => {
    renderScreen([game("g1")], []);
    await screen.findByText("半荘g1");

    expect(screen.queryByRole("button", { name: "お気に入りのみ表示" })).toBeNull();
    // 並び替えは他タブと同じ位置・同じ形で出す。
    expect(screen.getByLabelText("並び替え")).toBeTruthy();
  });

  it("種別で絞り込める（牌譜だけ / 何切るだけ）", async () => {
    renderScreen([game("g1")], [problem("p1")]);
    const kind = await screen.findByLabelText("種別で絞り込み");

    fireEvent.change(kind, { target: { value: "game" } });
    expect(screen.getByText("半荘g1")).toBeTruthy();
    expect(screen.queryByText("問題p1")).toBeNull();

    fireEvent.change(kind, { target: { value: "problem" } });
    expect(screen.queryByText("半荘g1")).toBeNull();
    expect(screen.getByText("問題p1")).toBeTruthy();
  });

  it("自分の半荘は編集画面、他人の半荘は公開ビューアへ開く", async () => {
    renderScreen([game("g1"), game("g2", { mine: true, ownerId: "me" })], []);
    fireEvent.click(await screen.findByRole("button", { name: /半荘g1/ }));
    expect(push).toHaveBeenCalledWith("/k/g1");

    fireEvent.click(screen.getByRole("button", { name: /半荘g2/ }));
    expect(push).toHaveBeenCalledWith("/kifu/g2");
  });

  it("★を外すとサーバーへ保存し、このタブからは消える（取り直さずに反映）", async () => {
    renderScreen([game("g1")], []);
    fireEvent.click(await screen.findByRole("button", { name: "お気に入り（1件）" }));
    await waitFor(() => expect(h.setFavoriteAction).toHaveBeenCalledWith("game", "g1", false));
    expect(screen.queryByText("半荘g1")).toBeNull();
  });

  it("お気に入りが多い順で並べ替えられる（牌譜・何切るをまたいで同じ並び）", async () => {
    renderScreen(
      [game("g1", { favoriteCount: 2 }), game("g2", { favoriteCount: 30 })],
      [problem("p1", { favoriteCount: 9 })],
    );
    fireEvent.change(await screen.findByLabelText("並び替え"), { target: { value: "fav" } });
    // 牌譜のあとに何切るを並べるため、各グループ内で件数順になる。
    expect(screen.getAllByRole("heading", { level: 3 }).map((x) => x.textContent)).toEqual([
      "半荘g2",
      "半荘g1",
      "問題p1",
    ]);
  });

  it("1件も無ければ★の付け方を案内する", async () => {
    renderScreen([], []);
    expect(await screen.findByText(/まだお気に入りがありません/)).toBeTruthy();
  });
});

describe("MyFavoritesScreen（取得失敗を空状態に化けさせない）", () => {
  it("読み込みに失敗したら、その旨と再読み込み導線を出す（「まだお気に入りがありません」と言わない）", async () => {
    stubMe("free");
    render(
      <AuthProvider>
        <MyFavoritesScreen initialCursor={null} initialGames={[]} initialProblems={[]} loadFailed />
      </AuthProvider>,
    );
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/まだお気に入りがありません/)).toBeNull();
  });

  it("成功して0件なら従来どおり空状態の案内を出す", async () => {
    renderScreen([], []);
    expect(await screen.findByText(/まだお気に入りがありません/)).toBeTruthy();
    expect(screen.queryByText(/読み込めませんでした/)).toBeNull();
  });
});
