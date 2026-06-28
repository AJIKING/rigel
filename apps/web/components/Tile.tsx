import type { ReadTile } from "@rigel/schema";
import { needsReview, REVIEW_COLOR, tileAssetName, tileLabel } from "@rigel/ui";

const W = 30;
const H = 40;

/**
 * 1牌の表示（OSS 画像 = FluffyStuff/riichi-mahjong-tiles, CC0）。
 * Front の上にシンボル(萬子/筒子/索子/字牌)を重ねて1牌にする。
 * 確信度が低い/読めない牌は赤枠で「要確認」、リーチ宣言牌は下に赤帯。
 * 自前・簡易フェイスは SimpleTile.tsx（予備）。
 */
export function Tile({ read, riichi = false }: { read: ReadTile; riichi?: boolean }) {
  const review = needsReview(read);
  const asset = read.tile ? tileAssetName(read.tile) : null;

  return (
    <span
      data-testid="tile"
      data-review={review ? "true" : undefined}
      title={tileLabel(read.tile)}
      style={{
        position: "relative",
        display: "inline-block",
        width: W,
        height: H,
        margin: 2,
        verticalAlign: "middle",
      }}
    >
      <img src="/tiles/Front.svg" alt="" width={W} height={H} style={{ display: "block" }} />
      {asset ? (
        <img
          src={`/tiles/${asset}.svg`}
          alt={tileLabel(read.tile)}
          width={W}
          height={H}
          style={{ position: "absolute", inset: 0 }}
        />
      ) : (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
            fontWeight: 700,
          }}
        >
          ?
        </span>
      )}
      {review && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            border: `2px solid ${REVIEW_COLOR}`,
            borderRadius: 4,
            boxSizing: "border-box",
          }}
        />
      )}
      {riichi && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 5,
            right: 5,
            bottom: 3,
            height: 2.5,
            background: REVIEW_COLOR,
            borderRadius: 1,
          }}
        />
      )}
    </span>
  );
}
