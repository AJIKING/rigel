import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { KifuListShell } from "./KifuListShell";

// next/navigation の useRouter をスタブ。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// Server Action は server-only を辿るためモック（未ログインなので呼ばれない）。
vi.mock("../../app/actions", () => ({ getMyGamesAction: vi.fn(() => Promise.resolve([])) }));

/** /api/me と /games/public をスタブ（公開フィードのフィルタ検証用）。 */
function stubFetch(cards: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/games/public") ? cards : { user: null }),
    })),
  );
}

function card(id: string, title: string, createdAt: string) {
  return {
    id,
    ownerId: "u1",
    ownerHandle: "taro",
    ownerName: "太郎",
    title,
    createdAt,
    kyokuCount: 1,
    firstLogId: `${id}-l1`,
  };
}

describe("KifuListShell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("公開牌譜の並び替えは「新着・今週・お気に入り」（mobile と統一。局数順は出さない）", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 10 * 24 * 3600 * 1000); // 10日前（今週外）
    stubFetch([
      card("g-old", "先週の半荘", old.toISOString()),
      card("g-new", "今日の半荘", now.toISOString()),
    ]);
    localStorage.setItem("rigel.favs", JSON.stringify(["g-old"]));
    render(
      <AuthProvider>
        <KifuListShell view="public" />
      </AuthProvider>,
    );

    const select = (await screen.findByLabelText("並び替え")) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(["新着", "今週", "お気に入り"]);

    // 新着: 両方出る（新しい順）。
    expect(await screen.findByText("今日の半荘")).toBeTruthy();
    expect(screen.getByText("先週の半荘")).toBeTruthy();

    // 今週: 直近7日だけ。
    fireEvent.change(select, { target: { value: "week" } });
    expect(screen.getByText("今日の半荘")).toBeTruthy();
    expect(screen.queryByText("先週の半荘")).toBeNull();

    // お気に入り: 自分がお気に入りした半荘だけ。
    fireEvent.change(select, { target: { value: "fav" } });
    expect(screen.getByText("先週の半荘")).toBeTruthy();
    expect(screen.queryByText("今日の半荘")).toBeNull();
  });

  it("公開牌譜ビューは見出しを表示する", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="public" />
      </AuthProvider>,
    );
    expect(await screen.findByRole("heading", { name: "牌譜" })).toBeTruthy();
  });

  it("マイページビューは未ログインだとログイン導線を出す", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="mine" />
      </AuthProvider>,
    );
    expect(await screen.findByText(/自分の牌譜を見るには/)).toBeTruthy();
  });

  it("未ログインのヘッダーはマイページを出さず、ログインボタンを出す", async () => {
    render(
      <AuthProvider>
        <KifuListShell view="public" />
      </AuthProvider>,
    );
    // 認証読み込みが終わるとログインボタンが出る。
    expect(await screen.findByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "マイページ" })).toBeNull();
  });
});
