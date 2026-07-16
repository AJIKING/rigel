import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import { TimelineEditor } from "./TimelineEditor";

function emptyKifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-07-05T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {} },
  });
}

/** kifu を state で保持し、変化を spy に流すテスト用ラッパ（複数操作を連ねるため）。 */
function Harness({ onKifu, initial }: { onKifu: (k: Kifu) => void; initial?: Kifu }) {
  const [k, setK] = useState(initial ?? emptyKifu());
  return (
    <TimelineEditor
      kifu={k}
      dealer="east"
      onChange={(nk) => {
        setK(nk);
        onKifu(nk);
      }}
    />
  );
}

const last = (spy: jest.Mock): Kifu => spy.mock.calls[spy.mock.calls.length - 1]![0] as Kifu;

describe("TimelineEditor（手順エディタ）", () => {
  it("＋打牌で親の打牌を足し、牌を選ぶと親の河に乗る", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByLabelText("打牌を選ぶ"));
    fireEvent.press(screen.getByLabelText("1萬"));
    const k = last(spy);
    expect(k.timeline).toHaveLength(1);
    expect(k.seats.east.river.map((d) => d.tile)).toEqual(["1m"]);
  });

  it("上へ移動で打牌の順番が入れ替わる（手順の並びに反映）", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    // 追加席は東南西北順に埋まる（1手目=東・2手目=南）。手順の並びで検証する。
    const discTiles = () =>
      last(spy)
        .timeline.filter((e) => e.kind === "discard")
        .map((e) => (e.kind === "discard" ? e.tile : null));
    // 1手目 1萬（東）
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByLabelText("打牌を選ぶ"));
    fireEvent.press(screen.getByLabelText("1萬"));
    // 2手目 2萬（南）
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getAllByLabelText("打牌を選ぶ")[1]!);
    fireEvent.press(screen.getByLabelText("2萬"));
    expect(discTiles()).toEqual(["1m", "2m"]);
    // 2手目を上へ → [2萬, 1萬]
    fireEvent.press(screen.getAllByLabelText("上へ移動")[1]!);
    expect(discTiles()).toEqual(["2m", "1m"]);
  });

  it("＋打牌は東南西北×巡目を順に埋める（必ず新巡目・東にならない）", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    const seats = () =>
      last(spy)
        .timeline.filter((e) => e.kind === "discard")
        .map((e) => e.seat);
    fireEvent.press(screen.getByText("＋打牌")); // 1件目=東
    expect(seats()).toEqual(["east"]);
    fireEvent.press(screen.getByText("＋打牌")); // 2件目=南
    expect(seats()).toEqual(["east", "south"]);
    fireEvent.press(screen.getByText("＋打牌")); // 3件目=西
    fireEvent.press(screen.getByText("＋打牌")); // 4件目=北
    fireEvent.press(screen.getByText("＋打牌")); // 5件目=東（新巡目）
    expect(seats()).toEqual(["east", "south", "west", "north", "east"]);
  });

  it("削除で打牌が消える", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByLabelText("削除"));
    const k = last(spy);
    expect(k.timeline).toHaveLength(0);
    expect(k.seats.east.river).toHaveLength(0);
  });

  it("「鳴き」ボタンは鳴いた人の選択メニューを開き、選ぶと鳴き行＋切った牌の行が入る", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    fireEvent.press(screen.getByText("＋打牌")); // 東の打牌
    fireEvent.press(screen.getByText("鳴きなし")); // メニューを開く
    fireEvent.press(screen.getByText("南家")); // 鳴いた人を選ぶ
    const k = last(spy);
    // 鳴き印＋鳴き行（ポン・from=捨て主）＋鳴いた人の打牌行（切った牌は後で選ぶ）が入る。
    expect(k.timeline).toHaveLength(3);
    expect(k.timeline[0]).toMatchObject({ kind: "discard", calledBy: "south" });
    expect(k.timeline[1]).toMatchObject({
      kind: "meld",
      seat: "south",
      meld: { type: "pon", from: "east" },
    });
    expect(k.timeline[2]).toMatchObject({ kind: "discard", seat: "south", tile: null });
    expect(k.seats.east.river[0]?.calledBy).toBe("south");
    expect(screen.getByText("鳴き→南家")).toBeTruthy();
  });

  it("メニューの「なし」で解除でき、連動の鳴き行・未入力の打牌行も消える", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByText("鳴きなし"));
    fireEvent.press(screen.getByText("南家"));
    fireEvent.press(screen.getByText("鳴き→南家")); // もう一度メニューを開く
    fireEvent.press(screen.getByText("なし"));
    const k = last(spy);
    expect(k.timeline).toHaveLength(1);
    expect(k.timeline[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(k.seats.south.melds).toHaveLength(0);
  });

  it("鳴き表示は選手名を優先する（鳴き→名前。無名は◯家のまま）", () => {
    const spy = jest.fn();
    const initial = KifuSchema.parse({
      ...emptyKifu(),
      players: { south: { name: "太郎" } },
      timeline: [{ kind: "discard", seat: "east", tile: "5p", calledBy: "south" }],
    });
    render(<Harness onKifu={spy} initial={initial} />);
    expect(screen.getByText("鳴き→太郎")).toBeTruthy();
  });

  it("鳴きの「から」を変えると鳴き元の捨て牌に鳴き印が付く（手順→捨て牌の同期）", () => {
    const spy = jest.fn();
    const initial = KifuSchema.parse({
      ...emptyKifu(),
      timeline: [
        { kind: "discard", seat: "east", tile: "5p" },
        {
          kind: "meld",
          seat: "south",
          meld: {
            type: "pon",
            tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
            from: "north",
          },
        },
      ],
    });
    render(<Harness onKifu={spy} initial={initial} />);
    // から: 北→東（自席=南は飛ばす）。東の直前の打牌（5p）に鳴き印が付く。
    fireEvent.press(screen.getByText("北家から"));
    const k = last(spy);
    expect(k.timeline[0]).toMatchObject({ kind: "discard", calledBy: "south" });
    expect(k.seats.east.river[0]?.calledBy).toBe("south");
  });

  it("鳴き行に「打」スロットがあり、切った牌を同じ行で選べる（無ければ直後に挿入）", () => {
    const spy = jest.fn();
    const initial = KifuSchema.parse({
      ...emptyKifu(),
      timeline: [
        {
          kind: "meld",
          seat: "west",
          meld: {
            type: "pon",
            tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
            from: "east",
          },
        },
      ],
    });
    render(<Harness onKifu={spy} initial={initial} />);
    fireEvent.press(screen.getByLabelText("切った牌を選ぶ"));
    fireEvent.press(screen.getByText("索"));
    fireEvent.press(screen.getByLabelText("9索"));
    const k = last(spy);
    expect(k.timeline).toHaveLength(2);
    expect(k.timeline[1]).toMatchObject({ kind: "discard", seat: "west", tile: "9s" });
    expect(k.seats.west.river.map((d) => d.tile)).toEqual(["9s"]);
  });

  it("カンの鳴き行では嶺上ツモも選べる", () => {
    const spy = jest.fn();
    const initial = KifuSchema.parse({
      ...emptyKifu(),
      timeline: [
        {
          kind: "meld",
          seat: "west",
          meld: {
            type: "kan_open",
            tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
            from: "east",
          },
        },
      ],
    });
    render(<Harness onKifu={spy} initial={initial} />);
    fireEvent.press(screen.getByLabelText("嶺上ツモを選ぶ"));
    fireEvent.press(screen.getByText("索"));
    fireEvent.press(screen.getByLabelText("6索"));
    const k = last(spy);
    expect(k.timeline[1]).toMatchObject({ kind: "discard", seat: "west", draw: "6s" });
  });

  it("鳴きと切った牌は1行に併合され、行の削除で両方消える（鳴き印も解除）", () => {
    const spy = jest.fn();
    const initial = KifuSchema.parse({
      ...emptyKifu(),
      timeline: [
        { kind: "discard", seat: "east", tile: "5p", calledBy: "west" },
        {
          kind: "meld",
          seat: "west",
          meld: {
            type: "pon",
            tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
            from: "east",
          },
        },
        { kind: "discard", seat: "west", tile: "9m" },
      ],
    });
    render(<Harness onKifu={spy} initial={initial} />);
    // 3イベントだが表示は2行。
    expect(screen.getAllByLabelText("削除")).toHaveLength(2);
    fireEvent.press(screen.getAllByLabelText("削除")[1]!);
    const k = last(spy);
    expect(k.timeline).toHaveLength(1);
    expect(k.timeline[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(k.seats.west.melds).toHaveLength(0);
    expect(k.seats.west.river).toHaveLength(0);
  });

  it("＋鳴きで鳴きを足し、種別を切り替えられる（席の鳴きに反映）", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    fireEvent.press(screen.getByText("＋鳴き"));
    expect(last(spy).seats.east.melds[0]?.type).toBe("pon");
    // 種別ボタン（ポン）を押すと次の種別（チー）へ。
    fireEvent.press(screen.getByText("ポン"));
    expect(last(spy).seats.east.melds[0]?.type).toBe("chi");
  });
});
