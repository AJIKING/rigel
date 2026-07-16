import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { KifuEditor } from "./KifuEditor";

function makeKifu(seats: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-07-04T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
  });
}

const riverKifu = (tiles: string[]): Kifu =>
  makeKifu({
    east: {
      river: tiles.map((t, i) => ({ order: i + 1, tile: t, riichi: false, confidence: 1 })),
    },
  });

describe("KifuEditor（モバイル編集画面）", () => {
  it("手牌に牌を追加して保存すると、その牌が onSave の Kifu に乗る", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("配牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    // 追加ピッカーは連続入力のため開いたまま。閉じると手牌に 1萬 が表示される。
    fireEvent.press(screen.getByText("閉じる"));
    expect(screen.getByLabelText("1萬")).toBeTruthy();

    fireEvent.press(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.hand).toEqual([{ tile: "1m", confidence: 1 }]);
  });

  it("配牌は牌を選ぶたびに理牌される（東→1萬の順に選んでも 1萬,東 で保存）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("配牌に追加"));
    fireEvent.press(screen.getByText("字")); // スートタブを字に切替
    fireEvent.press(screen.getByLabelText("東"));
    fireEvent.press(screen.getByText("萬")); // 戻して 1萬（ピッカーは開いたまま）
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "1z"]);
  });

  it("読み込んだ配牌が乱れていても理牌して表示・保存する（AIドラフトの正規化）", () => {
    const onSave = jest.fn();
    const k = makeKifu({
      east: {
        hand: [
          { tile: "1z", confidence: 1 },
          { tile: "1m", confidence: 1 },
        ],
      },
    });
    render(<KifuEditor initialKifu={k} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "1z"]);
  });

  it("席セグメントで南家に切り替えると南家の配牌を編集できる（4人それぞれ編集可能）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByRole("button", { name: "南家" })); // 席セグメント
    // 見出しに編集中の席が明示される。
    expect(screen.getByText(/南家の配牌/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("配牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.south.hand.map((t) => t.tile)).toEqual(["1m"]);
    expect(saved.seats.east.hand).toHaveLength(0);
  });

  it("seq が 16 を超える既存局（旧自動採番）は北四局(16)に丸めて保存する（API拒否の回復）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={17} onSave={onSave} />);
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![1]).toBe(16);
  });

  it("捨て牌の編集シートから鳴ける: 鳴いた人を選び、牌選択＝鳴いた人が切った牌（鳴かれた順送りは廃止）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    // 河に 5p を追加（追加シートに「鳴かれた」の順送りチップはもう無い）。
    fireEvent.press(screen.getByLabelText("河に追加"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("5筒"));
    expect(screen.queryByText("鳴きなし")).toBeNull();
    fireEvent.press(screen.getByText("閉じる"));

    // その捨て牌を開いて ポン → 切った牌に 1萬（鳴いた人の既定は下家＝南家）。
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByLabelText("ポンで鳴く"));
    fireEvent.press(screen.getByText("萬"));
    fireEvent.press(screen.getByLabelText("1萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    // 鳴き牌=5p×3・from=捨て主（東家）・鳴き印=南家 が自動で入る。
    expect(saved.seats.south.melds[0]).toMatchObject({ type: "pon", from: "east" });
    expect(saved.seats.south.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
    expect(saved.seats.east.river[0]?.calledBy).toBe("south");
    // 選んだ 1萬 は南家（鳴いた人）の捨て牌になる。
    expect(saved.seats.south.river[0]?.tile).toBe("1m");
  });

  it("捨て牌からのカンは大明槓固定。牌選択＝嶺上後に切った牌（作成ボタンは無い）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    fireEvent.press(screen.getByLabelText("河に追加"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByLabelText("カンで鳴く"));
    // 「切った牌を選ばず作成」は廃止（切った牌の選択で必ず河に並ぶ）。
    expect(screen.queryByText("切った牌を選ばず作成")).toBeNull();
    fireEvent.press(screen.getByText("萬"));
    fireEvent.press(screen.getByLabelText("1萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.south.melds[0]).toMatchObject({ type: "kan_open", from: "east" });
    expect(saved.seats.south.melds[0]?.tiles).toHaveLength(4);
    expect(saved.seats.east.river[0]?.calledBy).toBe("south");
    // 嶺上ツモの後に切った牌が河に並ぶ。
    expect(saved.seats.south.river[0]?.tile).toBe("1m");
  });

  it("鳴かれた捨て牌を開き直すと選択状態が復元され、選び直しは置き換えになる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    // ポンを作成（既定の鳴いた人=南家・切った牌 1萬）。
    fireEvent.press(screen.getByLabelText("河に追加"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByText("閉じる"));
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByLabelText("ポンで鳴く"));
    fireEvent.press(screen.getByText("萬"));
    fireEvent.press(screen.getByLabelText("1萬"));

    // 開き直すと ポン・南家 が選択済みで表示される。
    fireEvent.press(screen.getByLabelText("5筒"));
    expect(screen.getByRole("button", { name: "ポンで鳴く", selected: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "鳴いた人: 南家", selected: true })).toBeTruthy();

    // 鳴いた人を西家に変えて切った牌を 2萬 にすると、置き換えられる（重複しない）。
    fireEvent.press(screen.getByLabelText("鳴いた人: 西家"));
    fireEvent.press(screen.getByText("萬"));
    fireEvent.press(screen.getByLabelText("2萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.south.melds).toHaveLength(0);
    expect(saved.seats.south.river).toHaveLength(0);
    expect(saved.seats.west.melds[0]).toMatchObject({ type: "pon", from: "east" });
    expect(saved.seats.west.river.map((d) => d.tile)).toEqual(["2m"]);
    expect(saved.seats.east.river[0]?.calledBy).toBe("west");
  });

  it("チーの並び（左端/中央/右端）を選んで鳴きを追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByText("チー"));
    // 並びチップ: 選んだ牌を右端に置く（7筒なら 567）。
    fireEvent.press(screen.getByText("右端"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("7筒"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "6p", "7p"]);
  });

  it("局順を変えると親も局順に連動する（東二局=南家。web の局順変更と同一挙動）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    // RoundPicker の「局」セグメントで 二 を選ぶ（東二局）。
    fireEvent.press(screen.getByRole("button", { name: "二" }));
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![1]).toBe(2);
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.dealer).toBe("south");
  });

  it("プレビューの席をタップすると編集対象がその席に切り替わる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    // プレビューは既定で表示され、席タップで編集対象が変わる。
    fireEvent.press(screen.getByLabelText("西家を選択"));
    expect(screen.getByText(/西家の配牌/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText("配牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.west.hand).toHaveLength(1);
  });

  it("プレビューは折りたたみできる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    expect(screen.getByLabelText("東家を選択")).toBeTruthy();
    fireEvent.press(screen.getByText(/プレビュー/));
    expect(screen.queryByLabelText("東家を選択")).toBeNull();
  });

  it("手牌はピッカーを閉じずに連続で追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("配牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByLabelText("2萬")); // 閉じずに続けてタップ
    // タイトルに現在の枚数が出る（入力のフィードバック）。
    expect(screen.getByText(/配牌に追加（2枚）/)).toBeTruthy();
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.hand.map((t) => t.tile)).toEqual(["1m", "2m"]);
  });

  it("河の牌を削除すると order が振り直されて保存される", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={riverKifu(["6z", "7z"])} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("發")); // 河の發をタップ → 編集シート
    fireEvent.press(screen.getByText("削除"));
    expect(screen.queryAllByLabelText("發")).toHaveLength(0);

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.river.map((d) => d.tile)).toEqual(["7z"]);
    expect(saved.seats.east.river.map((d) => d.order)).toEqual([1]);
  });

  it("timeline が非空でも、盤面で足した捨て牌が保存Kifuの手順(timeline)へ乗る（往復整合）", () => {
    const onSave = jest.fn();
    const committed = KifuSchema.parse({
      ...riverKifu(["1m"]),
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
    render(<KifuEditor initialKifu={committed} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("河に追加"));
    fireEvent.press(screen.getByLabelText("3萬"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    // 手順に東:1m→東:3m が反映（timeline 非空でも消えない・追加が乗る）。
    expect(
      saved.timeline.filter((e) => e.kind === "discard").map((e) => `${e.seat}:${e.tile}`),
    ).toEqual(["east:1m", "east:3m"]);
  });

  it("河の牌にリーチ宣言を付けられる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={riverKifu(["5p"])} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベルの重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByText("リーチ"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.river[0]).toMatchObject({ tile: "5p", riichi: true });
  });

  it("局情報メタ（本場/供託）を増やして保存できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("本場を増やす"));
    fireEvent.press(screen.getByLabelText("本場を増やす"));
    fireEvent.press(screen.getByLabelText("供託を増やす"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.honba).toBe(2);
    expect(saved.meta.kyotaku).toBe(1);
  });

  it("最終巡目の入力は表示しない（モバイルでは不要）", () => {
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={jest.fn()} />);
    expect(screen.queryByLabelText("最終巡目を増やす")).toBeNull();
  });

  it("裏ドラを追加して保存できる（複数枚対応）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("裏ドラ表示牌を追加"));
    fireEvent.press(screen.getByText("字")); // スートタブを字に切替
    fireEvent.press(screen.getByLabelText("發"));
    // 2枚目（カンで増えたケース）。
    fireEvent.press(screen.getByLabelText("裏ドラ表示牌を追加"));
    fireEvent.press(screen.getByText("字"));
    fireEvent.press(screen.getByLabelText("白"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.uraDora).toEqual(["6z", "5z"]);
  });

  it("ドラは牌タップ→削除で1枚だけ取り除ける", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 牌ラベル重複を避けるため畳む
    fireEvent.press(screen.getByLabelText("ドラ表示牌を追加"));
    fireEvent.press(screen.getByText("字"));
    fireEvent.press(screen.getByLabelText("發"));
    fireEvent.press(screen.getByLabelText("ドラ表示牌1を変更")); // 追加した1枚を開く
    fireEvent.press(screen.getByText("削除"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.dora).toEqual([]);
  });

  it("局名を南三局に変更して保存すると seq=7 が渡る（局順は自由に編集できる）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 卓中央の局名と重複しないよう畳む
    fireEvent.press(screen.getByRole("button", { name: "南場" })); // 場=南
    fireEvent.press(screen.getByRole("button", { name: "三" })); // 局=三
    expect(screen.getByText("南三局")).toBeTruthy();
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![1]).toBe(7);
  });

  it("下書き/編集済の切替は編集画面に出さない（半荘単位＝半荘詳細で切替）", () => {
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={jest.fn()} />);
    expect(screen.queryByText("下書き")).toBeNull();
    expect(screen.queryByText("編集済")).toBeNull();
  });

  it("結果を和了→ロンにして役を選ぶと、agari と result が保存される", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/)); // 卓上の結果表示と重複しないよう畳む
    // 既定は結果なし → 和了フォームは出ない。
    expect(screen.queryByText("和了者")).toBeNull();

    fireEvent.press(screen.getByText("和了"));
    expect(screen.getByText("和了者")).toBeTruthy();
    fireEvent.press(screen.getByText("ロン")); // 種別トグルをロンに
    fireEvent.press(screen.getByText(/^立直/)); // 役チップ（立直 1飜。ダブル立直と区別）

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.result).toBe("ron");
    expect(saved.agari).toHaveLength(1);
    expect(saved.agari[0]?.yaku).toEqual([{ name: "立直", han: 1 }]);
    expect(saved.agari[0]?.from).not.toBeNull(); // ロンは放銃者を持つ
  });

  it("門前/鳴きを手動で切り替えると食い下がり飜で保存される（副露未記録の牌譜でも選べる）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    fireEvent.press(screen.getByText("和了"));

    // 鳴きありに切り替えてから混一色を選ぶ → 食い下がりの 2飜。
    fireEvent.press(screen.getByText("鳴きあり"));
    fireEvent.press(screen.getByText(/^混一色/));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.agari[0]?.yaku).toEqual([{ name: "混一色", han: 2 }]);
  });

  it("和了は既定ツモ、なしに戻すと和了が消える", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    fireEvent.press(screen.getByText("和了"));
    fireEvent.press(screen.getByText("保存"));
    let saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.result).toBe("tsumo"); // 既定はツモ（放銃者なし）
    expect(saved.agari[0]?.from).toBeNull();

    fireEvent.press(screen.getByText("なし"));
    fireEvent.press(screen.getByText("保存"));
    saved = onSave.mock.calls[1]![0] as Kifu;
    expect(saved.result).toBeNull();
    expect(saved.agari).toHaveLength(0);
  });

  it("和了をロンにすると和了者を追加できる（複数和了）", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    fireEvent.press(screen.getByText("和了"));
    fireEvent.press(screen.getByText("ロン")); // ロンにすると複数追加可能
    fireEvent.press(screen.getByText("＋ 和了者を追加"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.agari).toHaveLength(2);
    expect(saved.agari.every((a) => a.from !== null)).toBe(true);
  });

  it("流局で聴牌者を選ぶと result=draw と tenpai が保存される", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText(/プレビュー/));
    fireEvent.press(screen.getByText("流局"));
    fireEvent.press(screen.getByText("東家 不聴")); // 親=東を聴牌に

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.result).toBe("draw");
    expect(saved.tenpai).toEqual(["east"]);
    expect(saved.agari).toHaveLength(0);
  });

  it("鳴き（ポン）を追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText("ポン"));
    fireEvent.press(screen.getByText("筒")); // スートタブを筒に切替
    fireEvent.press(screen.getByLabelText("5筒"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.melds[0]?.type).toBe("pon");
    expect(saved.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
  });

  it("手順タブに切り替えると席編集が消え、打牌を足すと河に反映して保存できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    // 既定は盤面タブ（配牌セクションが出る）。
    expect(screen.getByText(/配牌/)).toBeTruthy();
    fireEvent.press(screen.getByText("手順"));
    // 手順タブでは配牌セクションは消え、追加ボタンが出る。
    expect(screen.queryByText(/配牌（/)).toBeNull();
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByLabelText("打牌を選ぶ"));
    fireEvent.press(screen.getByLabelText("3萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.river.map((d) => d.tile)).toEqual(["3m"]);
    expect(saved.timeline).toHaveLength(1);
  });

  it("ルール設定は編集画面には出さない（半荘単位で局一覧から編集する）", () => {
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={jest.fn()} />);
    expect(screen.queryByText(/ルール設定/)).toBeNull();
  });

  it("カンは種別（暗槓）を選んで追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} initialSeq={1} onSave={onSave} />);
    fireEvent.press(screen.getByText("暗槓"));
    fireEvent.press(screen.getByLabelText("1萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.melds[0]?.type).toBe("kan_closed");
    expect(saved.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["1m", "1m", "1m", "1m"]);
  });
});
