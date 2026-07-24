// 和了シートの手牌表示のテスト。和了牌単体ではなく手牌すべて（理牌＋副露＋
// 白枠の和了牌）を見せる（web の AgariOverlay と同一構成）。

import { KifuSchema, type Kifu } from "@rigel/schema";
import { render, screen } from "@testing-library/react-native";
import { AgariSheet } from "./AgariSheet";

function makeKifu(over: Record<string, unknown>): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {} },
    ...over,
  });
}

describe("AgariSheet（和了演出シート）", () => {
  it("手牌は理牌して表示し、副露と和了牌（別枠）を後ろに並べる", () => {
    const k = makeKifu({
      result: "tsumo",
      agari: [{ winner: "east", winTile: "5p", yaku: [{ name: "門前清自摸和", han: 1 }] }],
      seats: {
        east: {
          // 乱順の手牌（viewKifu 相当＝和了牌は除去済みの13枚型）。
          hand: [{ tile: "9s" }, { tile: "1m" }],
          melds: [
            {
              type: "pon",
              tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
              from: "south",
            },
          ],
        },
        south: {},
        west: {},
        north: {},
      },
    });
    render(<AgariSheet kifu={k} dealer="east" onClose={jest.fn()} onNext={null} />);

    // 並び: 理牌した手牌（1萬→9索）→ 副露（白×3）→ 和了牌（5筒・白枠の別枠）。
    const labels = screen
      .getAllByLabelText(/^(?:[1-9１-９].|白|發|中|東|南|西|北|赤5.)$/)
      .map((el) => el.props.accessibilityLabel as string);
    expect(labels).toEqual(["1萬", "9索", "白", "白", "白", "5筒"]);
    expect(screen.getByTestId("agari-win-tile")).toBeTruthy();
  });
});
