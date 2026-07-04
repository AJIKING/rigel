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
function Harness({ onKifu }: { onKifu: (k: Kifu) => void }) {
  const [k, setK] = useState(emptyKifu());
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

  it("上へ移動で打牌の順番が入れ替わる（河の並びに反映）", () => {
    const spy = jest.fn();
    render(<Harness onKifu={spy} />);
    // 1手目 1萬
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getByLabelText("打牌を選ぶ"));
    fireEvent.press(screen.getByLabelText("1萬"));
    // 2手目 2萬
    fireEvent.press(screen.getByText("＋打牌"));
    fireEvent.press(screen.getAllByLabelText("打牌を選ぶ")[1]!);
    fireEvent.press(screen.getByLabelText("2萬"));
    expect(last(spy).seats.east.river.map((d) => d.tile)).toEqual(["1m", "2m"]);
    // 2手目を上へ → [2萬, 1萬]
    fireEvent.press(screen.getAllByLabelText("上へ移動")[1]!);
    expect(last(spy).seats.east.river.map((d) => d.tile)).toEqual(["2m", "1m"]);
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
