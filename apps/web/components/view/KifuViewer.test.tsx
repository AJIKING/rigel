import { KifuSchema, type Kifu } from "@rigel/schema";
import { AGARI_DELAY_MS } from "@rigel/ui";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type PublicGameDetail } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { KifuViewer } from "./KifuViewer";

/** 親=東・手前=東の局を最小の指定で組む。seats は指定した席だけ上書き、その他は空。 */
function makeKifu(seats: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
    ...extra,
  });
}

const kifu = (): Kifu => makeKifu();

/** 東家(親)の河に1枚 + 立直ロン和了を持つ局。再生末尾で和了演出が出る検証用。 */
const kifuWithAgari = (): Kifu =>
  makeKifu(
    { east: { river: [{ order: 1, tile: "1m", riichi: false, confidence: 1 }] } },
    {
      result: "ron",
      agari: [
        { winner: "east", from: "south", winTile: "3m", yaku: [{ name: "立直", han: 1 }], fu: 40 },
      ],
    },
  );

function detail(logs: Kifu[], visibility: "public" | "private" = "public"): PublicGameDetail {
  return {
    game: { id: "g1", title: "公開テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    owner: { id: "u1", handle: "taro", displayName: "太郎" },
    logs: logs.map((k, i) => ({
      id: `l${i + 1}`,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: k,
      visibility,
      status: "complete" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

function renderViewer(d: PublicGameDetail) {
  return render(
    <AuthProvider>
      <KifuViewer detail={d} gameId="g1" />
    </AuthProvider>,
  );
}

describe("KifuViewer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("props で受け取った公開半荘を『読み込み中』なしで描画する", () => {
    renderViewer(detail([kifu()]));
    expect(screen.getByText("公開テスト卓")).toBeTruthy();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("局が無い半荘は空である旨を案内する", () => {
    renderViewer(detail([]));
    expect(screen.getByText(/局がありません/)).toBeTruthy();
  });

  it("局送りで表示局が切り替わる（東一局 → 東二局）", () => {
    renderViewer(detail([kifu(), kifu()]));
    const select = screen.getByLabelText("局を選択") as HTMLSelectElement;
    expect(select.value).toBe("0");
    fireEvent.click(screen.getAllByLabelText("次の局")[0]!);
    expect(select.value).toBe("1");
    fireEvent.click(screen.getAllByLabelText("前の局")[0]!);
    expect(select.value).toBe("0");
  });

  it("手牌表示トグルで相手手牌の表示状態が切り替わる", () => {
    renderViewer(detail([kifu()]));
    const toggle = screen.getByText("手牌表示");
    // 既定は表示（!hideOpp = true）。押すと非表示に切り替わる。
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("再生を末尾まで進めると、最後の演出を見せてから和了演出（役）が現れる（二段階）", () => {
    vi.useFakeTimers();
    renderViewer(detail([kifuWithAgari()]));
    // 初期の全表示では和了は出さない（リロード時のポップ防止）。
    expect(screen.queryByText("立直")).toBeNull();
    // 1手戻ってから末尾へ進める。到達直後は最後の演出（打牌の drop）を見せる間で、まだ出さない。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.queryByText("立直")).toBeNull();
    // 遅延の後に和了演出が出る。
    act(() => vi.advanceTimersByTime(AGARI_DELAY_MS));
    expect(screen.getByText("立直")).toBeTruthy();
  });

  it("局名は配列位置ではなく局順(seq)から出す（公開サブセット）", () => {
    // seq 1 と 3 だけ公開された半荘。配列位置(gi)基準だと2局目が「東二局」に化ける。
    const d = detail([kifu(), kifu()]);
    d.logs[1]!.seq = 3;
    renderViewer(d);
    fireEvent.click(screen.getAllByLabelText("次の局")[0]!);
    expect(screen.getAllByText("東三局").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("東二局").length).toBe(0);
  });

  it("配牌は理牌して表示する（保存順が乱れていても萬→筒→索→字の順）", () => {
    const d = detail([
      makeKifu({
        east: {
          hand: [
            { tile: "1z", confidence: 1 },
            { tile: "9s", confidence: 1 },
            { tile: "1m", confidence: 1 },
          ],
        },
      }),
    ]);
    const { container } = renderViewer(d);
    const alts = Array.from(container.querySelectorAll('[data-tile="hand"] img'))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt); // Front.svg（alt=""）を除く
    expect(alts).toEqual(["1萬", "9索", "東"]);
  });

  it("再生中の手牌は配牌とtimelineから導出する（手出しで手牌から捨て牌が消える）", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "2m", confidence: 1 },
            ],
          },
        },
        {
          timeline: [
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const alts = Array.from(container.querySelectorAll('[data-tile="hand"] img'))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(alts).toEqual(["2萬", "3萬"]);
  });

  it("リーチ宣言牌まで再生すると供託が増える", () => {
    renderViewer(
      detail([
        makeKifu(
          { east: { hand: [{ tile: "1m", confidence: 1 }] } },
          {
            meta: { dealer: "east", kyotaku: 0 },
            timeline: [
              {
                kind: "discard",
                seat: "east",
                draw: null,
                tile: "1m",
                tsumogiri: false,
                riichi: true,
                confidence: 1,
              },
            ],
          },
        ),
      ]),
    );
    expect(screen.getByText("1本")).toBeTruthy();
  });

  it("公開の半荘は「公開」バッジと共有ボタンを出す", () => {
    renderViewer(detail([kifu()]));
    expect(screen.getByText("公開")).toBeTruthy();
    expect(screen.getByText("共有")).toBeTruthy();
  });

  it("非公開の半荘（所有者の再生）は「非公開」バッジを出し、共有ボタンは出さない", () => {
    renderViewer(detail([kifu()], "private"));
    expect(screen.getByText("非公開")).toBeTruthy();
    expect(screen.queryByText("公開")).toBeNull();
    expect(screen.queryByText("共有")).toBeNull();
  });

  it("1手進めたときだけ直近の打牌に drop-in 演出が付く（初期全表示・巡目ジャンプでは付かない）", () => {
    // 東2打・南1打（親=東）。打牌順は 東→南→東、巡目区切りは [1, 3]。
    const riverTile = (order: number, tile: string) => ({ order, tile, confidence: 1 });
    const d = detail([
      makeKifu({
        east: { river: [riverTile(1, "1m"), riverTile(2, "2m")] },
        south: { river: [riverTile(1, "5p")] },
      }),
    ]);
    const { container } = renderViewer(d);

    // 初期の全表示（reveal=-1）では演出しない（リロード時に毎回動くのを防ぐ）。
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 先頭へ戻す（3→2→1→0手）。戻る操作では演出しない。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 1手進む（0→1）: 置かれた打牌1枚だけに演出が付く。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // 次の巡目（1→3 の2手ジャンプ）: 演出しない。
    fireEvent.click(screen.getByLabelText("次の巡目"));
    expect(container.querySelector("[data-drop]")).toBeNull();
  });

  it("次ボタンで半歩ずつ刻む（1押し目=ツモ牌が右端へ、2押し目=打牌が河へ）。前ボタンは逆", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "9p", confidence: 1 },
            ],
          },
        },
        {
          timeline: [
            // 1手目: 3m をツモって 1m を手出し → 手牌 [3m, 9p]（理牌）。
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
            // 2手目: 4m をツモ切り → 手牌は変わらない。
            {
              kind: "discard",
              seat: "east",
              draw: "4m",
              tile: "4m",
              tsumogiri: true,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const handAlts = () =>
      Array.from(container.querySelectorAll('[data-tile="hand"]:not([data-tsumo] *) img'))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);
    const slotAlts = () =>
      Array.from(container.querySelectorAll("[data-tsumo] img"))
        .map((img) => img.getAttribute("alt"))
        .filter((alt) => alt);

    // 初期の全表示では演出しない。
    expect(container.querySelector("[data-draw]")).toBeNull();

    // 先頭へ戻す（半歩も巻き戻る: done(2)→draw(2)→done(1)→draw(1)→done(0)）。
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByLabelText("1手戻る"));

    // 1押し目: 盤面は0手のまま、ツモ牌 3萬 が手牌右端のスロットへフライイン。河にはまだ落ちない。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(slotAlts()).toEqual(["3萬"]);
    expect(handAlts()).toEqual(["1萬", "9筒"]);
    expect(container.querySelector("[data-drop]")).toBeNull();

    // 2押し目: 打牌 1萬 が河へ drop し、手牌が理牌される（スロットは消える）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]);
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // ツモ切りの手も同じ半歩刻み（右端に入ってからそのまま河へ）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(slotAlts()).toEqual(["4萬"]);
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]); // ツモ切りは手牌が変わらない。
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);

    // 前ボタンは逆再生: まず打牌を引っ込めてツモ表示に戻る。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(slotAlts()).toEqual(["4萬"]);
    // さらに戻すと前の手の完了状態（スロットなし・河は1枚）。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(handAlts()).toEqual(["3萬", "9筒"]);
  });

  it("ツモ不明の手（未編集）は半歩なしで1押し=1打牌（従来どおり）", () => {
    const riverTile = (order: number, tile: string) => ({ order, tile, confidence: 1 });
    const d = detail([makeKifu({ east: { river: [riverTile(1, "1m"), riverTile(2, "2m")] } })]);
    const { container } = renderViewer(d);

    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手戻る"));
    // 1押しで打牌が直接河へ（スロットは出ない）。
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
    expect(container.querySelectorAll("[data-drop]")).toHaveLength(1);
  });

  it("ツモ和了は再生で末尾に達したときだけ和了牌を手牌の横に離して出す（河へ捨てる誤演出をしない）", () => {
    const d = detail([
      makeKifu(
        {
          east: {
            // 撮影スナップショット手牌（和了牌 5p を含む）。理牌後 [1m,2m,5p]。
            hand: [
              { tile: "1m", confidence: 1 },
              { tile: "5p", confidence: 1 },
              { tile: "2m", confidence: 1 },
            ],
            river: [{ order: 1, tile: "9m", confidence: 1 }],
          },
        },
        { result: "tsumo", agari: [{ winner: "east", winTile: "5p" }] },
      ),
    ]);
    const { container } = renderViewer(d);

    // 初期の全表示では出さない（和了演出と同じ発火条件。リロード時のポップ防止）。
    expect(container.querySelector("[data-tsumo]")).toBeNull();

    // 再生で末尾に達すると和了牌 5筒 が手牌本体と別枠（data-tsumo）に出る。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    const tsumo = container.querySelectorAll("[data-tsumo]");
    expect(tsumo).toHaveLength(1);
    const tsumoAlts = Array.from(tsumo[0]!.querySelectorAll("img"))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(tsumoAlts).toEqual(["5筒"]);
    // 手牌本体からはその1枚が抜ける（河には捨てられない）。
    const handAlts = Array.from(
      container.querySelectorAll('[data-tile="hand"]:not([data-tsumo] *) img'),
    )
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(handAlts).toEqual(["1萬", "2萬"]);

    // 末尾から離れると（1手戻る）和了牌の別枠は消える。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    expect(container.querySelector("[data-tsumo]")).toBeNull();
  });

  it("卓中央にはドラを表示し、ツモ表示は出さない（ツモはフライイン演出で分かる）", () => {
    const d = detail([
      makeKifu(
        { east: { hand: [{ tile: "1m", confidence: 1 }] } },
        {
          meta: { dealer: "east", dora: ["5z"] },
          timeline: [
            {
              kind: "discard",
              seat: "east",
              draw: "3m",
              tile: "1m",
              tsumogiri: false,
              riichi: false,
              confidence: 1,
            },
          ],
        },
      ),
    ]);
    const { container } = renderViewer(d);
    const center = container.querySelector("[data-center]")!;

    // ドラ（白=5z）が中央に出る。
    const alts = Array.from(center.querySelectorAll("img"))
      .map((img) => img.getAttribute("alt"))
      .filter((alt) => alt);
    expect(alts).toContain("白");

    // 1手進めて activeDraw がある状態でも、中央に「ツモ」表示は出さない。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(container.querySelector("[data-center]")!.textContent).not.toContain("ツモ");
  });

  it("本場は牌譜の実データを表示する（ハードコードしない）", () => {
    renderViewer(detail([makeKifu({}, { meta: { dealer: "east", honba: 2 } })]));
    // 卓中央・サイドパネルとも実データ（2本場）。ハードコードの「0本場」が残っていないこと。
    expect(screen.getAllByText("2本場").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0本場")).toBeNull();
  });
});
