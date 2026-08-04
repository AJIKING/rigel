import type { PublicGameCard } from "@rigel/client";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { PublicKifuScreen } from "./PublicKifuScreen";

// next/navigation の useRouter をスタブ（push はテストから観測できる共有スパイ）。
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
// Server Action はネットワークへ出るためモック。
vi.mock("../../app/actions", () => ({
  setFavoriteAction: vi.fn(() => Promise.resolve({ ok: true, faved: true, favoriteCount: 1 })),
}));

/** /api/me だけスタブ（カードは props で渡す＝サーバー側で取得済み）。 */
function stubMe() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ user: null }) })),
  );
}

function card(
  id: string,
  title: string,
  createdAt: string,
  fav: { favoriteCount?: number; viewerFaved?: boolean } = {},
): PublicGameCard {
  return {
    id,
    ownerId: "u1",
    ownerHandle: "taro",
    ownerName: "太郎",
    title,
    createdAt,
    kyokuCount: 1,
    firstLogId: `${id}-l1`,
    // お気に入りはサーバー保存。件数・自分の状態はカードが持つ。
    favoriteCount: fav.favoriteCount ?? 0,
    viewerFaved: fav.viewerFaved ?? false,
  };
}

function renderScreen(games: PublicGameCard[], loadFailed = false) {
  stubMe();
  return render(
    <AuthProvider>
      <PublicKifuScreen initialCursor={null} initialGames={games} loadFailed={loadFailed} />
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
});

describe("PublicKifuScreen: 追加読み込み（カーソル方式）", () => {
  it("nextCursor がある間だけ「もっと見る」が出て、クリックで次ページを追記する", async () => {
    stubMe();
    const fetchPage = vi.fn().mockResolvedValue({
      items: [card("g2", "2ページ目の半荘", new Date().toISOString())],
      nextCursor: null,
    });
    render(
      <AuthProvider>
        <PublicKifuScreen
          initialGames={[card("g1", "1ページ目の半荘", new Date().toISOString())]}
          initialCursor="1000_g1"
          fetchPage={fetchPage}
        />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "もっと見る" }));
    expect(await screen.findByText("2ページ目の半荘")).toBeTruthy();
    expect(fetchPage).toHaveBeenCalledWith("1000_g1");
    expect(screen.getByText("1ページ目の半荘")).toBeTruthy(); // 既存の表示は保つ
    expect(screen.queryByRole("button", { name: "もっと見る" })).toBeNull(); // 最終ページ
  });
});

describe("PublicKifuScreen（公開牌譜の一覧・SSR で受け取ったカードを描く）", () => {
  it("サーバーから渡されたカードを、取得を待たずにその場で描く（SEO 対象なので初回 HTML に載る）", () => {
    renderScreen([card("g1", "今日の半荘", new Date().toISOString())]);
    // findBy ではなく getBy（=非同期の取得を挟まない）で見つかることが要点。
    expect(screen.getByText("今日の半荘")).toBeTruthy();
  });

  it("並び替えは「新着・人気・今週・お気に入り」（mobile と統一。局数順は出さない）", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000); // 10日前（今週外）
    renderScreen([
      card("g-old", "先週の半荘", old.toISOString(), { favoriteCount: 9, viewerFaved: true }),
      card("g-new", "今日の半荘", now.toISOString(), { favoriteCount: 1 }),
    ]);

    const select = screen.getByLabelText("並び替え") as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "新着",
      "人気",
      "今週",
      "お気に入り",
    ]);

    // 人気: お気に入りが多い順（古くても上に来る）。
    fireEvent.change(select, { target: { value: "popular" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "先週の半荘",
      "今日の半荘",
    ]);

    // 今週: 直近7日だけ。
    fireEvent.change(select, { target: { value: "week" } });
    expect(screen.queryByText("先週の半荘")).toBeNull();

    // お気に入り: 自分が付けた（viewerFaved）半荘だけ。
    fireEvent.change(select, { target: { value: "fav" } });
    expect(screen.getByText("先週の半荘")).toBeTruthy();
    expect(screen.queryByText("今日の半荘")).toBeNull();
  });

  it("投稿者はキーボード操作できる <a href=/u/handle> リンクで、クリックしてもカード遷移へ伝播しない", () => {
    renderScreen([card("g1", "今日の半荘", new Date().toISOString())]);

    const author = screen.getByRole("link", { name: "@taro" });
    expect(author.tagName).toBe("A");
    expect(author.getAttribute("href")).toBe("/u/taro");

    fireEvent.click(author);
    expect(push).not.toHaveBeenCalledWith("/k/g1");
  });

  it("カードを押すと公開ビューアへ遷移する", () => {
    renderScreen([card("g1", "今日の半荘", new Date().toISOString())]);
    fireEvent.click(screen.getByRole("button", { name: /今日の半荘/ }));
    expect(push).toHaveBeenCalledWith("/k/g1");
  });

  it("見出しを表示する", () => {
    renderScreen([]);
    expect(screen.getByRole("heading", { name: "牌譜" })).toBeTruthy();
  });

  it("0件なら空状態、取得失敗ならその理由を出す（失敗を「まだありません」に化けさせない）", () => {
    const { unmount } = renderScreen([]);
    expect(screen.getByText(/公開されている牌譜がまだありません/)).toBeTruthy();
    unmount();

    renderScreen([], true);
    expect(screen.getByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/公開されている牌譜がまだありません/)).toBeNull();
  });
});
