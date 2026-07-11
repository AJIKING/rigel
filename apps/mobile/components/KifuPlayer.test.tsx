import type { GameLog } from "@rigel/client";
import { KifuSchema, type Kifu } from "@rigel/schema";
import { AGARI_DELAY_MS, STEP_DRAW_MS } from "@rigel/ui";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { KifuPlayer } from "./KifuPlayer";

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

const emptyKifu = (): Kifu => makeKifu();

/** 東家(親)の河に1枚 + 立直ロン和了。再生末尾で和了演出が出る検証用。 */
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

/** 東家(親)の河に發(6z)・中(7z)の2枚。河の巡送り/1手送りの表示切替を牌ラベルで検証する。 */
const kifuTwoDiscards = (): Kifu =>
  makeKifu({
    east: {
      river: [
        { order: 1, tile: "6z", riichi: false, confidence: 1 },
        { order: 2, tile: "7z", riichi: false, confidence: 1 },
      ],
    },
  });

/** 南家(相手)の手牌に發(6z)。手牌トグルで相手手牌の表示/裏返しを検証する。 */
const kifuOppHand = (): Kifu => makeKifu({ south: { hand: [{ tile: "6z", confidence: 1 }] } });

function log(seq: number, kifu: Kifu): GameLog {
  return {
    id: `l${seq}`,
    userId: "u1",
    gameId: "g1",
    seq,
    kifu,
    visibility: "public",
    status: "complete",
    createdAt: "2026-06-28T00:00:00.000Z",
  };
}

describe("KifuPlayer", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** 末尾へ進めて和了シートの遅延ぶんタイマーを進める。 */
  function stepToEndAndWait() {
    fireEvent.press(screen.getByLabelText("1手進む"));
    act(() => jest.advanceTimersByTime(AGARI_DELAY_MS));
  }

  it("再生を末尾まで進めると、最後の演出を見せてから和了演出（役）が現れる（二段階）", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    // 初期の全表示では和了は出さない（リロード時のポップ防止）。
    expect(screen.queryByText("立直")).toBeNull();
    fireEvent.press(screen.getByLabelText("1手戻る"));
    // 到達直後は最後の演出（打牌の drop）を見せる間で、まだ出さない。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.queryByText("立直")).toBeNull();
    act(() => jest.advanceTimersByTime(AGARI_DELAY_MS));
    expect(screen.getByText("立直")).toBeTruthy();
  });

  it("和了シートを閉じても、末尾へ再度進めれば再表示される", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    fireEvent.press(screen.getByLabelText("1手戻る"));
    stepToEndAndWait();
    expect(screen.getByText("立直")).toBeTruthy();

    fireEvent.press(screen.getByText("閉じる"));
    expect(screen.queryByText("立直")).toBeNull();

    // 末尾から離れて再び末尾へ → 再表示される（atEnd リセットの検証）。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    stepToEndAndWait();
    expect(screen.getByText("立直")).toBeTruthy();
  });

  it("1手進めると二段階で演出する（ツモ牌が右端スロットに入る → 打牌が河へ落ちる）", () => {
    const k = makeKifu(
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
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手進む"));

    // 第1段: ツモ牌 3萬 が右端スロットへ（河にはまだ落ちない）。
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.queryByTestId("drop-tile")).toBeNull();

    // 第2段: 打牌が河へ drop し、スロットは消える。
    act(() => jest.advanceTimersByTime(STEP_DRAW_MS));
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
    expect(screen.getByTestId("drop-tile")).toBeTruthy();
  });

  it("ツモ和了は最終局面で和了牌を手牌の横に離して出す（河へ捨てる誤演出をしない）", () => {
    // 編集済相当（最終手牌13枚型＝手牌に和了牌が無い）→ 14枚目として別枠に追加描画。
    const k = makeKifu(
      {
        east: {
          hand: [
            { tile: "1m", confidence: 1 },
            { tile: "2m", confidence: 1 },
          ],
          river: [{ order: 1, tile: "9m", confidence: 1 }],
        },
      },
      { result: "tsumo", agari: [{ winner: "east", winTile: "7z" }] },
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 初期の全表示では出さない（和了演出と同じ発火条件）。
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();

    // 再生で末尾に達すると和了牌（中）が手牌本体と別枠に出る
    //（和了シートも開き中を表示するため getAll で数える）。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.getAllByLabelText("中").length).toBeGreaterThan(0);

    // 末尾から離れると（1手戻る）別枠は消える。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
  });

  it("局送りは配列位置ではなく局順(seq)で局名を出す（公開サブセット）", () => {
    // seq 1 と 3 だけ公開された半荘（非連続）。gi 基準なら東二局、seq 基準なら東三局。
    render(<KifuPlayer logs={[log(1, emptyKifu()), log(3, emptyKifu())]} />);
    expect(screen.queryAllByText("東三局").length).toBe(0);
    fireEvent.press(screen.getByLabelText("次の局"));
    expect(screen.queryAllByText("東三局").length).toBeGreaterThan(0);
    // gi 基準で誤って付く「東二局」は出ない。
    expect(screen.queryAllByText("東二局").length).toBe(0);
  });

  it("1手戻る/1手進むで河の末尾の牌が隠れて/戻る", () => {
    render(<KifuPlayer logs={[log(1, kifuTwoDiscards())]} />);
    // 初期は全表示：發(1打目)も中(2打目)も見える（OSS 牌画像のラベルで検証）。
    expect(screen.getByLabelText("發")).toBeTruthy();
    expect(screen.getByLabelText("中")).toBeTruthy();
    // 1手戻ると末尾(中)が隠れる。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    expect(screen.getByLabelText("發")).toBeTruthy();
    expect(screen.queryByLabelText("中")).toBeNull();
    // 1手進むと戻る。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByLabelText("中")).toBeTruthy();
  });

  it("前の巡目/次の巡目で表示が巡単位で戻る/進む", () => {
    render(<KifuPlayer logs={[log(1, kifuTwoDiscards())]} />);
    expect(screen.getByLabelText("中")).toBeTruthy();
    // 親の打牌ごとに1巡なので、前の巡目で末尾(中)が隠れる。
    fireEvent.press(screen.getByLabelText("前の巡目"));
    expect(screen.queryByLabelText("中")).toBeNull();
    fireEvent.press(screen.getByLabelText("次の巡目"));
    expect(screen.getByLabelText("中")).toBeTruthy();
  });

  it("手牌は理牌して表示する（保存順が乱れていても萬→筒→索→字の順）", () => {
    // 手前(東)の手牌を 中(7z) → 1萬 の順で保存したデータ。表示は理牌される。
    const k = makeKifu({
      east: {
        hand: [
          { tile: "7z", confidence: 1 },
          { tile: "1m", confidence: 1 },
        ],
      },
    });
    render(<KifuPlayer logs={[log(1, k)]} />);
    const tiles = screen.getAllByLabelText(/^(1萬|中)$/);
    expect(tiles.map((t) => t.props.accessibilityLabel)).toEqual(["1萬", "中"]);
  });

  it("再生中の手牌は配牌とtimelineから導出する（手出しで手牌から捨て牌が消える）", () => {
    const k = makeKifu(
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
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 1萬は手牌からは消えるが、河に1枚だけ残る。
    expect(screen.getAllByLabelText("1萬")).toHaveLength(1);
    expect(screen.getByLabelText("2萬")).toBeTruthy();
    expect(screen.getByLabelText("3萬")).toBeTruthy();
  });

  it("リーチ宣言牌まで再生すると供託が増える", () => {
    const k = makeKifu(
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
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    expect(screen.getByText("供託 1本")).toBeTruthy();
  });

  it("1手進めたときだけ直近の打牌に drop-in 演出が付く（初期全表示・巡目ジャンプでは付かない）", () => {
    // 東2打・南1打（親=東）。打牌順は 東→南→東、巡目区切りは [1, 3]。
    const k = makeKifu({
      east: {
        river: [
          { order: 1, tile: "6z", riichi: false, confidence: 1 },
          { order: 2, tile: "7z", riichi: false, confidence: 1 },
        ],
      },
      south: { river: [{ order: 1, tile: "5z", riichi: false, confidence: 1 }] },
    });
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 初期の全表示（reveal=-1）では演出しない（開くたびに動くのを防ぐ）。
    expect(screen.queryByTestId("drop-tile")).toBeNull();

    // 先頭へ戻す（3→2→1→0手）。戻る操作では演出しない。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手戻る"));
    expect(screen.queryByTestId("drop-tile")).toBeNull();

    // 1手進む（0→1）: 置かれた打牌1枚だけに演出が付く。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByTestId("drop-tile")).toBeTruthy();

    // 次の巡目（1→3 の2手ジャンプ）: 演出しない。
    fireEvent.press(screen.getByLabelText("次の巡目"));
    expect(screen.queryByTestId("drop-tile")).toBeNull();
  });

  it("ツモ切りの1手も同じ二段階（右端スロットに入ってからそのまま河へ）", () => {
    const k = makeKifu(
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
          // 1手目: 3m をツモって 1m を手出し。2手目: 4m をツモ切り。
          {
            kind: "discard",
            seat: "east",
            draw: "3m",
            tile: "1m",
            tsumogiri: false,
            riichi: false,
            confidence: 1,
          },
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
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 初期の全表示では演出しない。
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();

    // 先頭へ戻して2手目（ツモ切り）まで進める。1手目の演出は流し切る。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手進む"));
    act(() => jest.advanceTimersByTime(STEP_DRAW_MS));

    fireEvent.press(screen.getByLabelText("1手進む"));
    // 第1段: ツモ切りでも右端スロットに 4萬 が入る（河にはまだ落ちない）。
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.queryByTestId("drop-tile")).toBeNull();
    // 第2段: そのまま河へ drop（手牌は変わらない）。
    act(() => jest.advanceTimersByTime(STEP_DRAW_MS));
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
    expect(screen.getByTestId("drop-tile")).toBeTruthy();
  });

  it("手牌トグルで相手の手牌が表(牌)/裏に切り替わる", () => {
    render(<KifuPlayer logs={[log(1, kifuOppHand())]} />);
    // 既定は相手手牌を裏向き（發は出ない）。
    expect(screen.queryByLabelText("發")).toBeNull();
    fireEvent.press(screen.getByText("手牌"));
    expect(screen.getByLabelText("發")).toBeTruthy();
    fireEvent.press(screen.getByText("手牌"));
    expect(screen.queryByLabelText("發")).toBeNull();
  });
});
