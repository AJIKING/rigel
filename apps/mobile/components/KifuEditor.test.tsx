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
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("手牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    // ピッカーが閉じ、手牌に 1萬 が表示される。
    expect(screen.getByLabelText("1萬")).toBeTruthy();

    fireEvent.press(screen.getByText("保存"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.hand).toEqual([{ tile: "1m", confidence: 1 }]);
  });

  it("河の牌を削除すると order が振り直されて保存される", () => {
    const onSave = jest.fn();
    render(
      <KifuEditor
        initialKifu={riverKifu(["6z", "7z"])}
        seq={1}
        initialStatus="draft"
        onSave={onSave}
      />,
    );
    fireEvent.press(screen.getByLabelText("發")); // 河の發をタップ → 編集シート
    fireEvent.press(screen.getByText("削除"));
    expect(screen.queryAllByLabelText("發")).toHaveLength(0);

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.river.map((d) => d.tile)).toEqual(["7z"]);
    expect(saved.seats.east.river.map((d) => d.order)).toEqual([1]);
  });

  it("河の牌にリーチ宣言を付けられる", () => {
    const onSave = jest.fn();
    render(
      <KifuEditor initialKifu={riverKifu(["5p"])} seq={1} initialStatus="draft" onSave={onSave} />,
    );
    fireEvent.press(screen.getByLabelText("5筒"));
    fireEvent.press(screen.getByText("リーチ"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.river[0]).toMatchObject({ tile: "5p", riichi: true });
  });

  it("局情報メタ（本場/供託/最終巡目）を増やして保存できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("本場を増やす"));
    fireEvent.press(screen.getByLabelText("本場を増やす"));
    fireEvent.press(screen.getByLabelText("供託を増やす"));
    fireEvent.press(screen.getByLabelText("最終巡目を増やす"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.honba).toBe(2);
    expect(saved.meta.kyotaku).toBe(1);
    expect(saved.meta.junme).toBe(2); // 既定1 + 1
  });

  it("裏ドラを選んで保存できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByLabelText("裏ドラを選ぶ"));
    fireEvent.press(screen.getByText("字")); // スートタブを字に切替
    fireEvent.press(screen.getByLabelText("發"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.meta.uraDora).toBe("6z");
  });

  it("編集済に切り替えて保存すると status=complete が渡る", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByText("編集済"));
    fireEvent.press(screen.getByText("保存"));
    expect(onSave.mock.calls[0]![1]).toBe("complete");
  });

  it("結果をロンにして役を選ぶと、agari と result が保存される", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    // 既定は結果なし → 和了フォームは出ない。
    expect(screen.queryByText("和了者")).toBeNull();

    fireEvent.press(screen.getByText("ロン"));
    expect(screen.getByText("和了者")).toBeTruthy();
    fireEvent.press(screen.getByText(/^立直/)); // 役チップ（立直 1飜。ダブル立直と区別）

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.result).toBe("ron");
    expect(saved.agari).toHaveLength(1);
    expect(saved.agari[0]?.yaku).toEqual([{ name: "立直", han: 1 }]);
    expect(saved.agari[0]?.from).not.toBeNull(); // ロンは放銃者を持つ
  });

  it("結果をツモに切り替えると from が null になり、なしに戻すと和了が消える", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByText("ツモ"));
    fireEvent.press(screen.getByText("保存"));
    let saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.result).toBe("tsumo");
    expect(saved.agari[0]?.from).toBeNull();

    fireEvent.press(screen.getByText("なし"));
    fireEvent.press(screen.getByText("保存"));
    saved = onSave.mock.calls[1]![0] as Kifu;
    expect(saved.result).toBeNull();
    expect(saved.agari).toHaveLength(0);
  });

  it("鳴き（ポン）を追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByText("ポン"));
    fireEvent.press(screen.getByText("筒")); // スートタブを筒に切替
    fireEvent.press(screen.getByLabelText("5筒"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.melds[0]?.type).toBe("pon");
    expect(saved.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["5p", "5p", "5p"]);
  });

  it("ルール設定で赤ドラを各2枚にして保存できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByText(/ルール設定/));
    fireEvent.press(screen.getByText("各2枚")); // 赤ドラ=各2枚
    fireEvent.press(screen.getByLabelText("ルールを保存")); // シートを閉じる
    fireEvent.press(screen.getByText("保存")); // エディタの保存
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.rules.aka).toBe("2");
  });

  it("カンは種別（暗槓）を選んで追加できる", () => {
    const onSave = jest.fn();
    render(<KifuEditor initialKifu={makeKifu()} seq={1} initialStatus="draft" onSave={onSave} />);
    fireEvent.press(screen.getByText("暗槓"));
    fireEvent.press(screen.getByLabelText("1萬"));

    fireEvent.press(screen.getByText("保存"));
    const saved = onSave.mock.calls[0]![0] as Kifu;
    expect(saved.seats.east.melds[0]?.type).toBe("kan_closed");
    expect(saved.seats.east.melds[0]?.tiles.map((t) => t.tile)).toEqual(["1m", "1m", "1m", "1m"]);
  });
});
