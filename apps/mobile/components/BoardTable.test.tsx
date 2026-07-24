import { KifuSchema, type Kifu } from "@rigel/schema";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { BoardTable } from "./BoardTable";

/** 東家(手前・親)の河に發(6z)・中(7z)の2枚。他席は空。 */
function makeKifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: {
      east: {
        river: [
          { order: 1, tile: "6z", riichi: false },
          { order: 2, tile: "7z", riichi: false },
        ],
      },
      south: {},
      west: {},
      north: {},
    },
  });
}

describe("BoardTable", () => {
  it("highlightRiver で指定した河の1枚だけ強調枠（アクセント色）が付く", () => {
    render(
      <BoardTable
        kifu={makeKifu()}
        bottomSeat="east"
        dealer="east"
        roundLabel="東一局"
        revealed={{ east: 2, south: 0, west: 0, north: 0 }}
        showHands={false}
        highlightRiver={{ seat: "east", index: 1 }}
      />,
    );
    // index=1 の中(7z)だけ強調され、發(6z)には枠が付かない。
    expect(StyleSheet.flatten(screen.getByLabelText("中").props.style)).toMatchObject({
      borderColor: colors.accent,
    });
    expect(StyleSheet.flatten(screen.getByLabelText("發").props.style).borderColor).toBeUndefined();
  });

  it("highlightRiver を渡さなければどの牌にも強調枠が付かない（既存利用箇所は無変更）", () => {
    render(
      <BoardTable
        kifu={makeKifu()}
        bottomSeat="east"
        dealer="east"
        roundLabel="東一局"
        revealed={{ east: 2, south: 0, west: 0, north: 0 }}
        showHands={false}
      />,
    );
    expect(StyleSheet.flatten(screen.getByLabelText("中").props.style).borderColor).toBeUndefined();
  });
});
