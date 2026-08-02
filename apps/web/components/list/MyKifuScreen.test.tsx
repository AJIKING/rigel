import type { MyGameCard } from "@rigel/client";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({
  getMyGamesAction: vi.fn(),
  setFavoriteAction: vi.fn(),
  deleteGameAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { MyKifuScreen } from "./MyKifuScreen";

function card(id: string, over: Partial<MyGameCard> = {}): MyGameCard {
  return {
    id,
    title: `半荘${id}`,
    createdAt: "2026-07-20T00:00:00.000Z",
    kyokuCount: 4,
    publicCount: 0,
    draftCount: 0,
    favoriteCount: 0,
    viewerFaved: false,
    ...over,
  };
}

beforeEach(() => {
  push.mockReset();
  h.getMyGamesAction.mockReset().mockResolvedValue([]);
  h.setFavoriteAction.mockReset().mockResolvedValue({ ok: true, faved: true, favoriteCount: 1 });
  h.deleteGameAction.mockReset().mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MyKifuScreen（マイページの牌譜タブ）", () => {
  it("未ログインならログイン導線を出す（公開一覧と違い、ここは本人専用）", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText(/自分の牌譜を見るには/)).toBeTruthy();
    // 作成にはサインインが必要なので、新規ボタンは出さない（mobile と同じ決まり）。
    expect(screen.queryByRole("button", { name: /新規/ })).toBeNull();
  });

  it("ログイン済みなら自分の半荘を出し、公開/非公開と編集状態のバッジを付ける", async () => {
    stubMe("free");
    h.getMyGamesAction.mockResolvedValue([card("g1", { publicCount: 2, draftCount: 1 })]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText("半荘g1")).toBeTruthy();
    expect(screen.getAllByText("公開").length).toBeGreaterThan(0);
    expect(screen.getByText("下書き")).toBeTruthy();
  });

  it("取得に失敗したら理由を出す（「該当する牌譜がありません」に化けさせない）", async () => {
    stubMe("free");
    h.getMyGamesAction.mockRejectedValue(new Error("network"));
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText(/読み込めませんでした/)).toBeTruthy();
    expect(screen.queryByText(/該当する牌譜がありません/)).toBeNull();
  });

  it("解析中の0局半荘は「解析中…」バッジだけを出し、開こうとしても遷移しない（開く先の局が無い）", async () => {
    stubMe("free");
    h.getMyGamesAction.mockResolvedValue([
      card("g1", { kyokuCount: 0, analysisStatus: "processing" }),
    ]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText("解析中…")).toBeTruthy();
    // 0局の解析中カードに「非公開・編集済」を並べない（mobile と同じ抑制）。
    expect(screen.queryByText("編集済")).toBeNull();

    fireEvent.click(screen.getByText("半荘g1"));
    expect(push).not.toHaveBeenCalled();
  });

  it("解析失敗の0局半荘は「解析失敗」バッジを出し、開こうとしたら削除の確認→削除で一覧から消す", async () => {
    stubMe("free");
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    h.getMyGamesAction.mockResolvedValue([card("g1", { kyokuCount: 0, analysisStatus: "failed" })]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText("解析失敗")).toBeTruthy();

    fireEvent.click(screen.getByText("半荘g1"));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("削除"));
    await waitFor(() => expect(h.deleteGameAction).toHaveBeenCalledWith("g1"));
    await waitFor(() => expect(screen.queryByText("半荘g1")).toBeNull());
    expect(push).not.toHaveBeenCalled();
  });

  it("解析失敗でも確認をキャンセルしたら消さない", async () => {
    stubMe("free");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    h.getMyGamesAction.mockResolvedValue([card("g1", { kyokuCount: 0, analysisStatus: "failed" })]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    fireEvent.click(await screen.findByText("半荘g1"));
    expect(h.deleteGameAction).not.toHaveBeenCalled();
    expect(screen.getByText("半荘g1")).toBeTruthy();
  });

  it("局がある半荘は解析中でも通常どおり開ける（追加解析の進行はバッジで示すだけ）", async () => {
    stubMe("free");
    h.getMyGamesAction.mockResolvedValue([
      card("g1", { kyokuCount: 2, analysisStatus: "processing" }),
    ]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByText("解析中…")).toBeTruthy();
    // 局があるので編集状態バッジは通常どおり並ぶ。
    expect(screen.getByText("編集済")).toBeTruthy();

    fireEvent.click(screen.getByText("半荘g1"));
    expect(push).toHaveBeenCalledWith("/kifu/g1");
  });

  it("ツールバーは何切るタブと同じ構成（検索・状態・並び替え・お気に入り・新規）", async () => {
    stubMe("free");
    h.getMyGamesAction.mockResolvedValue([card("g1")]);
    render(
      <AuthProvider>
        <MyKifuScreen />
      </AuthProvider>,
    );
    expect(await screen.findByLabelText("自分の牌譜を検索")).toBeTruthy();
    expect(screen.getByLabelText("公開状態で絞り込み")).toBeTruthy();
    const sort = screen.getByLabelText("並び替え") as HTMLSelectElement;
    expect(Array.from(sort.options).map((o) => o.textContent)).toEqual([
      "新しい順",
      "古い順",
      "お気に入りが多い順",
    ]);
    expect(screen.getByRole("button", { name: "お気に入りのみ表示" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "新規" })).toBeTruthy();
  });
});
