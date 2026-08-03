// 回転卓の河ジオメトリ検証（オーナー報告 2026-08-03: 河の1枚目・6枚目が隣家の
// 河の端の牌と角で被る）。RNTL は実レイアウトを持たないため、描画と同じ式の
// 純関数（riverRects）で矩形を計算し、隣家同士が交差しないことを固定する。
// 修正は風車オフセット（GEO.riverShift。実卓の河と同じずらし配置）。

import { riverRects, type Rect } from "./BoardTable";

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

describe("河のジオメトリ（風車オフセット）", () => {
  it.each([260, 330, 420])("盤面サイズ %d で4席の河が互いに交差しない", (size) => {
    const rects = riverRects(size);
    const cams = Object.keys(rects) as (keyof typeof rects)[];
    const bad: string[] = [];
    for (let i = 0; i < cams.length; i++) {
      for (let j = i + 1; j < cams.length; j++) {
        if (overlaps(rects[cams[i]!], rects[cams[j]!])) {
          bad.push(`${cams[i]} × ${cams[j]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("オフセット無しでは交差する（このテストが守っている前提の確認）", () => {
    // riverShift（GEO.riverShift=0.065）を打ち消した矩形（=旧配置）は bottom×left が交差する。
    const size = 330;
    const shifted = riverRects(size);
    const shift = size * 0.065;
    const unshifted = {
      bottom: { ...shifted.bottom, x: shifted.bottom.x - shift },
      left: { ...shifted.left, y: shifted.left.y - shift },
    };
    expect(overlaps(unshifted.bottom, unshifted.left)).toBe(true);
  });
});
