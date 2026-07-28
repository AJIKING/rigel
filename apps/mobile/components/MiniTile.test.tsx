// リーチ宣言牌（横向き）のレイアウト補償。RN の transform: rotate はレイアウト幅を
// 変えないため、回転した牌（視覚幅 = h）が隣の牌に食い込んで重なる
// （2026-07-29 エミュレータ実測: 編集画面の河でリーチ牌が両隣に 6px ずつ重なった）。
// 差分 (h - w) / 2 を左右マージンで補償する、を回帰として固定する。

import { tileLabel } from "@rigel/ui";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { MiniTile } from "./MiniTile";

function boxStyle(riichi: boolean) {
  render(<MiniTile code="1m" w={30} h={42} riichi={riichi} />);
  const el = screen.getByLabelText(tileLabel("1m"));
  return StyleSheet.flatten(el.props.style);
}

describe("MiniTile のリーチ牌（横向き）", () => {
  it("回転した牌は視覚幅との差分を左右マージンで補償する（隣と重ねない）", () => {
    const style = boxStyle(true);
    expect(style.marginHorizontal).toBe(6); // (42 - 30) / 2
    expect(style.width).toBe(30);
  });

  it("通常の牌にはマージン補償を付けない", () => {
    const style = boxStyle(false);
    expect(style.marginHorizontal).toBeUndefined();
  });
});
