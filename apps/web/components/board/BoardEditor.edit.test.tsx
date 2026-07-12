import { KifuSchema, type Kifu } from "@rigel/schema";
import { tileLabel } from "@rigel/ui";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type GameDetail } from "../../lib/api";

// 認証は Server Component 側（Cookie）が済ませ、BoardEditor は initialDetail を props で
// 受け取る。書き込みは Server Action。ここでは actions をモックして検証する。
// （app/actions は server-only を辿るため、実体は読み込まない。）
const h = vi.hoisted(() => ({
  getGameAction: vi.fn(),
  updateKifuAction: vi.fn(),
  setGameVisibilityAction: vi.fn(),
  deleteKifuAction: vi.fn(),
  analyzeAction: vi.fn(),
  createEmptyKifuAction: vi.fn(),
  createGameAction: vi.fn(),
  getMyGamesAction: vi.fn(),
  updateProfileAction: vi.fn(),
  createCheckoutAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  updateGameAction: vi.fn(),
  updateGameRulesAction: vi.fn(),
  updateGamePlayersAction: vi.fn(),
  deleteGameAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// next/navigation の useRouter をスタブ（半荘削除後の遷移で使う）。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { BoardEditor } from "./BoardEditor";

function makeKifu(seats: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
    meta: { dealer: "east" },
  });
}

function makeDetail(logs: { id: string }[]): GameDetail {
  return {
    game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    logs: logs.map((l, i) => ({
      id: l.id,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: makeKifu(),
      visibility: "private" as const,
      status: "complete" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

beforeEach(() => {
  h.updateKifuAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.setGameVisibilityAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.deleteKifuAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.getGameAction.mockReset().mockResolvedValue(makeDetail([{ id: "l1" }]));
});

describe("BoardEditor 選手情報（ポイント状況）", () => {
  it("選手情報欄は kifu.players から初期化され、変更して blur すると半荘単位で保存される", async () => {
    h.updateGamePlayersAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
    const detail = makeDetail([{ id: "l1" }]);
    detail.logs[0]!.kifu = KifuSchema.parse({
      ...detail.logs[0]!.kifu,
      players: {
        east: { name: "多井", points: 120.3 },
        south: { name: "園田", points: -45.7 },
        west: {},
        north: {},
      },
    });
    render(<BoardEditor initialDetail={detail} gameId="g1" logId="l1" />);

    // アコーディオン（呼称は mobile と同じ「選手情報」）を開くと保存済みの値が入っている。
    fireEvent.click(await screen.findByRole("button", { name: "選手情報" }));
    const nameInputs = screen.getAllByLabelText("選手名") as HTMLInputElement[];
    const ptInputs = screen.getAllByLabelText("ポイント") as HTMLInputElement[];
    expect(nameInputs[0]!.value).toBe("多井");
    expect(ptInputs[0]!.value).toBe("120.3");
    expect(ptInputs[1]!.value).toBe("-45.7");

    // ポイントを書き換えて blur → 半荘単位の保存 API が呼ばれ、成功が表示される。
    fireEvent.change(ptInputs[0]!, { target: { value: "130.5" } });
    fireEvent.blur(ptInputs[0]!);
    await waitFor(() => expect(h.updateGamePlayersAction).toHaveBeenCalledTimes(1));
    const [gameId, players] = h.updateGamePlayersAction.mock.calls[0] as [string, unknown];
    expect(gameId).toBe("g1");
    expect(players).toMatchObject({
      east: { name: "多井", points: 130.5 },
      south: { name: "園田", points: -45.7 },
    });
    expect(await screen.findByText("選手情報を保存しました")).toBeTruthy();

    // 変更のない blur では保存 API を呼ばない（全局書き込みの無駄撃ち防止）。
    fireEvent.blur(ptInputs[0]!);
    fireEvent.blur(nameInputs[1]!);
    expect(h.updateGamePlayersAction).toHaveBeenCalledTimes(1);
  });

  it("全席が空（名前なし・0pt）なら null で保存する（記録しない対局へ戻す）", async () => {
    h.updateGamePlayersAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "選手情報" }));
    const nameInputs = screen.getAllByLabelText("選手名") as HTMLInputElement[];
    // 未入力のまま blur しても何も送らない（初期状態は未変更）。
    fireEvent.blur(nameInputs[0]!);
    expect(h.updateGamePlayersAction).not.toHaveBeenCalled();
    // 一度名前を入れてから消す → blur 時に null で保存される。
    fireEvent.change(nameInputs[0]!, { target: { value: "多井" } });
    fireEvent.blur(nameInputs[0]!);
    await waitFor(() => expect(h.updateGamePlayersAction).toHaveBeenCalledTimes(1));
    fireEvent.change(nameInputs[0]!, { target: { value: "" } });
    fireEvent.blur(nameInputs[0]!);
    await waitFor(() => expect(h.updateGamePlayersAction).toHaveBeenCalledTimes(2));
    expect(h.updateGamePlayersAction.mock.calls[1]![1]).toBeNull();
  });
});

describe("BoardEditor 編集操作", () => {
  it("手牌に牌を追加して保存すると、その牌が updateKifuAction の Kifu に乗る", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家の配牌に追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1m") }));

    expect(await screen.findByRole("button", { name: "東家の配牌 を編集" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [logId, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(logId).toBe("l1");
    expect(kifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m"]);
  });

  it("配牌は牌を選ぶたびに理牌される（東→1萬の順に選んでも 1萬,東 で保存）", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    // 1枚目: 字牌タブから東(1z)。
    fireEvent.click(await screen.findByRole("button", { name: "東家の配牌に追加" }));
    let dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByText("字"));
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1z") }));
    // 2枚目: 1萬。追加でピッカーは閉じるので開き直す。
    fireEvent.click(screen.getByRole("button", { name: "東家の配牌に追加" }));
    dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("1m") }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "1z"]);
  });

  it("読み込んだ牌譜の配牌が乱れていても理牌して表示・保存する（AIドラフトの正規化）", async () => {
    const d = makeDetail([{ id: "l1" }]);
    d.logs[0]!.kifu = KifuSchema.parse({
      ...makeKifu(),
      seats: {
        east: {
          hand: [
            { tile: "1z", confidence: 1 },
            { tile: "1m", confidence: 1 },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    render(<BoardEditor initialDetail={d} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "1z"]);
  });

  it("河への追加時に捨て方とリーチ宣言を選んでから牌を選ぶと、その牌に反映される", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家に捨て牌を追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: "自摸切り" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "リーチ（横向き）" }));
    fireEvent.click(within(dialog).getByText("筒"));
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("5p") }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.river[0]).toMatchObject({
      tile: "5p",
      order: 1,
      tsumogiri: true,
      riichi: true,
    });
  });

  it("timeline が非空でも、盤面で足した捨て牌が保存Kifuの手順(timeline)へ巡目位置で乗る（往復整合）", async () => {
    // east:1m を committed 済み（timeline 非空＝手順タブを一度使った後の状態）。
    const committed = KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-06-28T00:00:00.000Z",
      cameraBottomSeat: "east",
      meta: { dealer: "east" },
      seats: {
        east: {
          hand: [],
          melds: [],
          river: [{ order: 1, tile: "1m", riichi: false, tsumogiri: false, confidence: 1 }],
        },
        south: {},
        west: {},
        north: {},
      },
      timeline: [
        {
          kind: "discard",
          seat: "east",
          draw: null,
          tile: "1m",
          tsumogiri: false,
          riichi: false,
          confidence: 1,
        },
      ],
    });
    const detail: GameDetail = {
      game: { id: "g1", userId: "u1", title: "テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
      logs: [
        {
          id: "l1",
          userId: "u1",
          gameId: "g1",
          seq: 1,
          kifu: committed,
          visibility: "private",
          status: "complete",
          createdAt: "2026-06-28T00:00:00.000Z",
        },
      ],
    };
    render(<BoardEditor initialDetail={detail} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "南家に捨て牌を追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByText("筒"));
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("2p") }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    // 手順は 1巡目 east→south の巡目順（末尾集中しない）。
    expect(kifu.timeline.filter((e) => e.kind === "discard").map((e) => e.tile)).toEqual([
      "1m",
      "2p",
    ]);
  });

  it("追加ピッカーで鳴き（ポン）を選んで牌を選ぶと、配牌ではなく鳴きが作成される", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家の配牌に追加" }));
    const dialog = screen.getByRole("dialog", { name: "牌を選ぶ" });
    fireEvent.click(within(dialog).getByRole("button", { name: "ポン" }));
    fireEvent.click(within(dialog).getByText("筒"));
    fireEvent.click(within(dialog).getByRole("button", { name: tileLabel("5p") }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.melds[0]?.type).toBe("pon");
    expect(kifu.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    expect(kifu.seats.east.hand).toHaveLength(0); // 配牌には足されない
  });

  it("盤面プレビューの手牌行に「配牌」ラベルを表示する（4席）", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    expect(await screen.findAllByText("配牌")).toHaveLength(4);
  });

  it("公開に切り替えると半荘単位の setGameVisibilityAction を呼ぶ（局単位では選ばない）", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    fireEvent.click(await screen.findByRole("button", { name: "公開" }));
    await waitFor(() => expect(h.setGameVisibilityAction).toHaveBeenCalledWith("g1", "public"));
    expect(await screen.findByText(/公開ページを見る/)).toBeTruthy();
  });

  it("非公開でも再生ページへのリンクが出る（所有者のプレビュー）", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    const link = await screen.findByText(/再生ページを見る/);
    expect(link.closest("a")?.getAttribute("href")).toBe("/k/g1");
  });

  it("結果を流局にして聴牌者を選ぶと result=draw と tenpai が保存される", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    // 結果アコーディオンは初期状態で開いている。
    fireEvent.click(within(await screen.findByRole("group", { name: "結果" })).getByText("流局"));
    fireEvent.click(within(screen.getByRole("group", { name: "聴牌者" })).getByText("東家"));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.result).toBe("draw");
    expect(kifu.tenpai).toEqual(["east"]);
    expect(kifu.agari).toHaveLength(0);
  });

  it("配牌の牌をピッカーから削除できる", async () => {
    const d = makeDetail([{ id: "l1" }]);
    d.logs[0]!.kifu = makeKifu({ east: { hand: [{ tile: "1m", confidence: 1 }] } });
    render(<BoardEditor initialDetail={d} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家の配牌 を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "この牌を削除" }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.hand).toHaveLength(0);
  });

  it("河の牌を削除すると order が振り直されて保存される", async () => {
    const d = makeDetail([{ id: "l1" }]);
    d.logs[0]!.kifu = makeKifu({
      east: {
        river: [
          { order: 1, tile: "1z", confidence: 1 },
          { order: 2, tile: "2z", confidence: 1 },
        ],
      },
    });
    render(<BoardEditor initialDetail={d} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: "東家の河 1枚目 を編集" }));
    fireEvent.click(screen.getByRole("button", { name: "この牌を削除" }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.river.map((r) => r.tile)).toEqual(["2z"]);
    expect(kifu.seats.east.river.map((r) => r.order)).toEqual([1]); // 連番を壊さない
  });

  it("鳴きをピッカーから丸ごと削除できる", async () => {
    const d = makeDetail([{ id: "l1" }]);
    d.logs[0]!.kifu = makeKifu({
      east: {
        melds: [
          {
            type: "pon",
            tiles: [
              { tile: "5p", confidence: 1 },
              { tile: "5p", confidence: 1 },
              { tile: "5p", confidence: 1 },
            ],
            from: null,
          },
        ],
      },
    });
    render(<BoardEditor initialDetail={d} gameId="g1" logId="l1" />);

    fireEvent.click((await screen.findAllByRole("button", { name: "東家の鳴き を編集" }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "この鳴きを削除" }));

    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(h.updateKifuAction).toHaveBeenCalled());
    const [, kifu] = h.updateKifuAction.mock.calls[0] as [string, Kifu];
    expect(kifu.seats.east.melds).toHaveLength(0);
  });

  it("局メニューに要確認の牌数バッジを出す（読めない牌・低confidence）", async () => {
    const d = makeDetail([{ id: "l1" }, { id: "l2" }]);
    d.logs[0]!.kifu = makeKifu({ east: { hand: [{ tile: null, confidence: 0 }] } });
    render(<BoardEditor initialDetail={d} gameId="g1" logId="l1" />);

    fireEvent.click(await screen.findByRole("button", { name: /東一局/ }));
    expect(screen.getByText("要確認 1")).toBeTruthy();
  });

  it("局が1つだけなら削除ボタンは無効", async () => {
    render(<BoardEditor initialDetail={makeDetail([{ id: "l1" }])} gameId="g1" logId="l1" />);
    const del = await screen.findByRole("button", { name: "この局を削除" });
    expect((del as HTMLButtonElement).disabled).toBe(true);
  });

  it("局が複数あるとき、2度押しで deleteKifuAction を呼ぶ（誤操作防止）", async () => {
    render(
      <BoardEditor
        initialDetail={makeDetail([{ id: "l1" }, { id: "l2" }])}
        gameId="g1"
        logId="l1"
      />,
    );
    const del = await screen.findByRole("button", { name: "この局を削除" });
    fireEvent.click(del);
    expect(h.deleteKifuAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "もう一度押して削除" }));
    await waitFor(() => expect(h.deleteKifuAction).toHaveBeenCalledWith("l1"));
  });
});
