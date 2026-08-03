import type { GameLog } from "@rigel/client";
import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
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
    { east: { river: [{ order: 1, tile: "1m", riichi: false }] } },
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
        { order: 1, tile: "6z", riichi: false },
        { order: 2, tile: "7z", riichi: false },
      ],
    },
  });

/** 南家(相手)の手牌に發(6z)。手牌トグルで相手手牌の表示/裏返しを検証する。 */
const kifuOppHand = (): Kifu => makeKifu({ south: { hand: [{ tile: "6z" }] } });

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
  it("fav を渡すと★ボタンが出て、押すと onToggle が呼ばれる（web ビューアの★と対。Phase D）", () => {
    const onToggle = jest.fn();
    render(
      <KifuPlayer
        logs={[log(1, emptyKifu())]}
        isPublic
        fav={{ faved: false, count: 3, onToggle }}
      />,
    );

    fireEvent.press(screen.getByLabelText("お気に入りに追加/解除（3件）"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("onEdit を渡すと編集ボタンが出る（自分の牌譜のみ）。渡さなければ出ない", () => {
    const onEdit = jest.fn();
    const { rerender } = render(
      <KifuPlayer logs={[log(1, emptyKifu())]} isPublic onEdit={onEdit} />,
    );
    fireEvent.press(screen.getByLabelText("編集"));
    expect(onEdit).toHaveBeenCalled();

    rerender(<KifuPlayer logs={[log(1, emptyKifu())]} isPublic />);
    expect(screen.queryByLabelText("編集")).toBeNull();
  });

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

  it("結果（ロン/放銃）は和了演出を見るまでネームプレートに出さない（ネタバレ防止）", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    // 初期の全表示でも結果タグはまだ出さない。
    expect(screen.queryByText("ロン")).toBeNull();
    expect(screen.queryByText("放銃")).toBeNull();
    // 情報シートの「結果」も伏せる。
    fireEvent.press(screen.getByText("情報"));
    expect(screen.queryAllByText(/ロン/).length).toBe(0);
    fireEvent.press(screen.getByLabelText("閉じる（背景）"));
    // 和了演出を開いて閉じたら、以後は結果タグを出してよい。
    fireEvent.press(screen.getByLabelText("1手進む"));
    fireEvent.press(screen.getByLabelText("前へ"));
    expect(screen.getByText("放銃")).toBeTruthy();
  });

  it("情報シートはシート外（背景）タップで閉じられる", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} />);
    fireEvent.press(screen.getByText("情報"));
    expect(screen.getByText("局情報")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("閉じる（背景）"));
    expect(screen.queryByText("局情報")).toBeNull();
  });

  it("局ナビのサブ表示は「局」でなく本場を出す", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} />);
    expect(screen.queryByText("局")).toBeNull(); // 旧サブラベル「局」は廃止。
    expect(screen.getByText("0本場")).toBeTruthy();
  });

  it("トグル（手牌）は選択状態を accessibilityState.selected で読み上げに伝える", () => {
    render(<KifuPlayer logs={[log(1, kifuOppHand())]} />);
    // 初期は非表示（selected=false）。押すと表示（selected=true）に変わる。
    expect(screen.getByRole("button", { name: "手牌" }).props.accessibilityState.selected).toBe(
      false,
    );
    fireEvent.press(screen.getByRole("button", { name: "手牌" }));
    expect(screen.getByRole("button", { name: "手牌" }).props.accessibilityState.selected).toBe(
      true,
    );
  });

  it("全画面ボタンは置かない（モバイルは全画面でもデザインが変わらないため）", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} />);
    expect(screen.queryByLabelText("全画面")).toBeNull();
  });

  it("局送りで移動した局は最終巡目ではなく開始位置（打牌前）で表示される", () => {
    // 移動先に河1枚を持たせる（全表示なら1手進んだ状態＝「1手戻る」が有効になってしまう）。
    const second = makeKifu({
      east: { river: [{ order: 1, tile: "2m", riichi: false }] },
    });
    render(<KifuPlayer logs={[log(1, emptyKifu()), log(2, second)]} />);
    fireEvent.press(screen.getByLabelText("次の局"));
    // 開始位置＝1手も進んでいない。
    expect(screen.getByLabelText("1手戻る").props.accessibilityState?.disabled).toBe(true);
  });

  it("和了シート: 「前へ」でシート前の盤面へ、「次の局へ」で次局の開始へ移動できる", () => {
    // 2局目にも河1枚を持たせる（全表示と開始位置を「1手戻る」の活性で区別するため）。
    const second = makeKifu({
      east: { river: [{ order: 1, tile: "2m", riichi: false }] },
    });
    render(<KifuPlayer logs={[log(1, kifuWithAgari()), log(2, second)]} />);
    fireEvent.press(screen.getByLabelText("1手進む")); // 末尾（全表示）→ 和了演出
    expect(screen.getByText("立直")).toBeTruthy();

    // 前へ: シートを閉じて同じ局の末尾に戻る（局は変わらない）。
    fireEvent.press(screen.getByLabelText("前へ"));
    expect(screen.queryByText("立直")).toBeNull();
    expect(screen.getAllByText("東一局").length).toBeGreaterThan(0);

    // もう一度開いて 次の局へ: 次局の開始位置（0手目）へ移動する。
    fireEvent.press(screen.getByLabelText("1手進む"));
    fireEvent.press(screen.getByLabelText("次の局へ"));
    expect(screen.queryByText("立直")).toBeNull();
    expect(screen.getAllByText("東二局").length).toBeGreaterThan(0);
    // 開始位置なら1手も進んでいない＝「1手戻る」が無効（全表示なら河1枚ぶん進んで有効）。
    expect(screen.getByLabelText("1手戻る").props.accessibilityState?.disabled).toBe(true);
  });

  it("和了シート: 最終局では「次の局へ」を無効にする", () => {
    render(<KifuPlayer logs={[log(1, kifuWithAgari())]} />);
    fireEvent.press(screen.getByLabelText("1手進む"));
    expect(screen.getByLabelText("次の局へ").props.accessibilityState?.disabled).toBe(true);
  });

  it("次ボタンで半歩ずつ刻む（1押し目=ツモ牌が右端へ、2押し目=打牌が河へ）。前ボタンは逆", () => {
    const k = makeKifu(
      {
        east: {
          hand: [{ tile: "1m" }, { tile: "9p" }],
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
          hand: [{ tile: "1m" }, { tile: "7z" }, { tile: "2m" }],
          river: [{ order: 1, tile: "9m" }],
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
        hand: [{ tile: "7z" }, { tile: "1m" }],
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
          hand: [{ tile: "1m" }, { tile: "2m" }],
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
      { east: { hand: [{ tile: "1m" }] } },
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
          { order: 1, tile: "6z", riichi: false },
          { order: 2, tile: "7z", riichi: false },
        ],
      },
      south: { river: [{ order: 1, tile: "5z", riichi: false }] },
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
          hand: [{ tile: "1m" }, { tile: "9p" }],
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
          },
          {
            kind: "discard",
            seat: "east",
            draw: "4m",
            tile: "4m",
            tsumogiri: true,
            riichi: false,
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
      { east: { river: [{ order: 1, tile: "1m", riichi: true }] } },
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

  it("鳴かれた捨て牌（calledBy）は河で薄表示になる", () => {
    const k = makeKifu({
      east: {
        river: [
          { order: 1, tile: "5p", calledBy: "south" },
          { order: 2, tile: "1m" },
        ],
      },
    });
    render(<KifuPlayer logs={[log(1, k)]} />);
    const opacityOf = (label: string) =>
      StyleSheet.flatten(screen.getByLabelText(label).props.style as StyleProp<ViewStyle>).opacity;
    expect(opacityOf("5筒")).toBe(0.38);
    expect(opacityOf("1萬")).toBeUndefined();
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
    // ポイント表示のトグルも出さない（対象が無いのに切替だけあると混乱する）。
    expect(screen.queryByText("ポイント")).toBeNull();
    fireEvent.press(screen.getByText("情報"));
    expect(screen.queryByText("選手情報")).toBeNull();
  });

  it("全員 0.0pt の選手情報はポイント状況を既定で隠し、「ポイント」トグルで表示できる", () => {
    const zero = { name: "", points: 0 };
    const k = makeKifu(
      {},
      { players: { east: { name: "多井", points: 0 }, south: zero, west: zero, north: zero } },
    );
    render(<KifuPlayer logs={[log(1, k)]} ownerName="太郎" />);
    // 全員 +0.0 は情報が無いのと同じなので盤面には出さない（選手名は出る）。
    expect(screen.getByText("多井")).toBeTruthy();
    expect(screen.queryByText("+0.0")).toBeNull();
    fireEvent.press(screen.getByText("ポイント"));
    expect(screen.getAllByText("+0.0").length).toBeGreaterThan(0);
  });

  it("ポイントが記録されていれば既定で表示し、「ポイント」トグルで隠せる", () => {
    const k = makeKifu(
      {},
      { players: { east: { name: "多井", points: 120.3 }, south: {}, west: {}, north: {} } },
    );
    render(<KifuPlayer logs={[log(1, k)]} ownerName="太郎" />);
    expect(screen.getByText("+120.3")).toBeTruthy();
    fireEvent.press(screen.getByText("ポイント"));
    expect(screen.queryByText("+120.3")).toBeNull();
    // 選手名は残る（隠すのはポイントだけ）。
    expect(screen.getByText("多井")).toBeTruthy();
  });

  it("情報シートで半荘ルールを確認できる（見出しタップで開閉・既定は閉）", () => {
    render(<KifuPlayer logs={[log(1, emptyKifu())]} />);
    fireEvent.press(screen.getByText("情報"));
    // 見出しに一致プリセット名（既定ルール＝Mリーグ相当）。中身は折りたたみ既定。
    expect(screen.getByText("ルール（Mリーグ）")).toBeTruthy();
    expect(screen.queryByText("切り上げ満貫")).toBeNull();
    // 見出しタップで展開（値ラベルは共有の ruleSummaryRows 由来）。
    fireEvent.press(screen.getByText("ルール（Mリーグ）"));
    expect(screen.getByText("切り上げ満貫")).toBeTruthy();
    expect(screen.getByText("ウマ")).toBeTruthy();
    expect(screen.getByText("10-30")).toBeTruthy();
    expect(screen.getByText("喰いタン")).toBeTruthy();
    // もう一度タップで畳める。
    fireEvent.press(screen.getByText("ルール（Mリーグ）"));
    expect(screen.queryByText("切り上げ満貫")).toBeNull();
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
