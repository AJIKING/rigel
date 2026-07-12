import type { GameLog } from "@rigel/client";
import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
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
  it("ロン: 最後の打牌まで進めても和了はまだ出ず、次ボタンで和了演出（役）が現れる", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    // 初期の全表示では和了は出さない（リロード時のポップ防止）。
    expect(screen.queryByText("立直")).toBeNull();
    fireEvent.press(screen.getByLabelText("1手戻る"));
    // 到達しただけではまだ出さない（drop を見せる番）。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.queryByText("立直")).toBeNull();
    // 次ボタンで和了演出が開く。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();
  });

  it("和了シートを閉じても、次ボタンで再表示できる", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    fireEvent.press(screen.getByLabelText("1手進む")); // 末尾（全表示）→ 和了演出
    expect(screen.getByText("立直")).toBeTruthy();

    fireEvent.press(screen.getByText("閉じる"));
    expect(screen.queryByText("立直")).toBeNull();

    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();
  });

  it("次ボタンで半歩ずつ刻む（1押し目=ツモ牌が右端へ、2押し目=打牌が河へ）。前ボタンは逆", () => {
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

    // 先頭へ（全表示からの戻りは半歩も巻き戻る: done(1)→draw(1)→done(0)）。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手戻る"));

    // 1押し目: ツモ牌 3萬 が右端スロットへ（河にはまだ落ちない）。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.queryByTestId("drop-tile")).toBeNull();

    // 2押し目: 打牌が河へ drop し、スロットは消える。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
    expect(screen.getByTestId("drop-tile")).toBeTruthy();

    // 前ボタンは逆: 打牌を引っ込めてツモ表示に戻る。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
  });

  it("ツモ和了: 次ボタンで和了牌をツモり（右端へ）、もう一度押すと和了演出が開く", () => {
    // スナップショット相当（和了牌 7z が手牌に混ざった14枚型の簡略）。
    const k = makeKifu(
      {
        east: {
          hand: [
            { tile: "1m", confidence: 1 },
            { tile: "7z", confidence: 1 },
            { tile: "2m", confidence: 1 },
          ],
          river: [{ order: 1, tile: "9m", confidence: 1 }],
        },
      },
      { result: "tsumo", agari: [{ winner: "east", winTile: "7z" }] },
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 初期の全表示では出さない（最初から和了牌が離れて見える誤表示をしない）。
    // 手牌本体にも混ぜない（ツモる前は13枚型で見せる＝「中」はどこにも出ない）。
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
    expect(screen.queryByLabelText("中")).toBeNull();

    // 次ボタン → 和了牌（中）をツモる（別枠に出る。和了シートはまだ）。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.getByLabelText("中")).toBeTruthy();
    expect(screen.queryByText("閉じる")).toBeNull();

    // もう一度次ボタン → 和了シートが開く。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByText("閉じる")).toBeTruthy();

    // 前ボタンで逆再生: シートを閉じる → 和了牌を引っ込める。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    expect(screen.queryByText("閉じる")).toBeNull();
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
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

    // 先頭へ戻す（半歩も巻き戻る: done(2)→draw(2)→done(1)→draw(1)→done(0)）。
    for (let i = 0; i < 4; i++) fireEvent.press(screen.getByLabelText("1手戻る"));
    // 1手目を半歩×2で流し、2手目（ツモ切り）へ。
    fireEvent.press(screen.getByLabelText("1手進む"));
    fireEvent.press(screen.getByLabelText("1手進む"));

    fireEvent.press(screen.getByLabelText("1手進む"));
    // 1押し目: ツモ切りでも右端スロットに 4萬 が入る（河にはまだ落ちない）。
    expect(screen.getByTestId("tsumo-tile")).toBeTruthy();
    expect(screen.queryByTestId("drop-tile")).toBeNull();
    // 2押し目: そのまま河へ drop（手牌は変わらない）。
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.queryByTestId("tsumo-tile")).toBeNull();
    expect(screen.getByTestId("drop-tile")).toBeTruthy();
  });

  it("和了シートにドラ表示牌と裏ドラ表示牌（リーチ和了時）を出す", () => {
    const k = makeKifu(
      { east: { river: [{ order: 1, tile: "1m", riichi: true, confidence: 1 }] } },
      {
        meta: { dealer: "east", dora: ["5z"], uraDora: ["6z"] },
        result: "ron",
        agari: [
          {
            winner: "east",
            from: "south",
            winTile: "3m",
            riichi: ["east"],
            yaku: [{ name: "立直", han: 1 }],
            ura: 1,
            fu: 40,
          },
        ],
      },
    );
    render(<KifuPlayer logs={[log(1, k)]} />);

    // 末尾まで進めて和了シートを開く。
    fireEvent.press(screen.getByLabelText("1手戻る"));
    fireEvent.press(screen.getByLabelText("1手進む"));
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();

    // ドラ表示牌（白）と裏ドラ表示牌（發）が牌グリフで出る。
    expect(within(screen.getByTestId("agari-dora")).getByLabelText("白")).toBeTruthy();
    expect(within(screen.getByTestId("agari-ura")).getByLabelText("發")).toBeTruthy();
  });

  it("席をタップすると視点が切り替わる（選んだ席が手前へ回り、その手牌が見える）", () => {
    render(<KifuPlayer logs={[log(1, kifuOppHand())]} ownerName="太郎" />);
    // 既定は撮影者（東）視点: 南家の手牌(發)は裏向き。
    expect(screen.queryByLabelText("發")).toBeNull();
    // 南家の視点へ: 南家が手前に回り、手前席として手牌が表で見える。
    fireEvent.press(screen.getByLabelText("南家の視点にする"));
    expect(screen.getByLabelText("發")).toBeTruthy();
    // 撮影者名は撮影者の席（東）に付いたまま出続ける。
    expect(screen.getByText("太郎")).toBeTruthy();
    // 東家の視点に戻すと再び裏向きになる。
    fireEvent.press(screen.getByLabelText("東家の視点にする"));
    expect(screen.queryByLabelText("發")).toBeNull();
  });

  it("選手情報（players）がある半荘は、ネームプレートに選手名とポイント状況を出す", () => {
    const k = makeKifu(
      {},
      {
        players: {
          east: { name: "多井", points: 120.3 },
          south: { name: "園田", points: -45.7 },
          west: {},
          north: {},
        },
      },
    );
    render(<KifuPlayer logs={[log(1, k)]} ownerName="太郎" />);

    // 選手名（撮影者名より優先）と積み上げポイントが各席に出る。
    expect(screen.getByText("多井")).toBeTruthy();
    expect(screen.getByText("+120.3")).toBeTruthy();
    expect(screen.getByText("園田")).toBeTruthy();
    expect(screen.getByText("-45.7")).toBeTruthy();
    expect(screen.queryByText("太郎")).toBeNull();

    // 情報シートにも選手情報節（ネームプレートは切り詰められるためフル名が読める場所）。
    fireEvent.press(screen.getByText("情報"));
    expect(screen.getByText("選手情報")).toBeTruthy();
  });

  it("選手情報が無い半荘はポイント状況を出さない（従来表示のまま）", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} ownerName="太郎" />);
    expect(screen.queryByText("+0.0")).toBeNull();
    expect(screen.getByText("太郎")).toBeTruthy(); // 撮影者名は従来どおり
    fireEvent.press(screen.getByText("情報"));
    expect(screen.queryByText("選手情報")).toBeNull();
  });

  it("情報シートで半荘ルールを確認できる（プリセット名＋各項目の値）", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} />);
    fireEvent.press(screen.getByText("情報"));
    // 見出しに一致プリセット名（既定ルール＝Mリーグ相当）。
    expect(screen.getByText("ルール（Mリーグ）")).toBeTruthy();
    // 項目名と値のペアが出る（値ラベルは共有の ruleSummaryRows 由来）。
    expect(screen.getByText("切り上げ満貫")).toBeTruthy();
    expect(screen.getByText("ウマ")).toBeTruthy();
    expect(screen.getByText("10-30")).toBeTruthy();
    expect(screen.getByText("喰いタン")).toBeTruthy();
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
