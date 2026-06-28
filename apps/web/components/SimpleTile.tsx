import type { ReadTile } from "@rigel/schema";
import { needsReview, REVIEW_COLOR, tileFace, tileLabel } from "@rigel/ui";

const W = 30;
const H = 40;

/**
 * 自前・簡易フェイスの牌（フォールバック / 軽量表示用）。
 * 既定の描画は OSS 画像の Tile.tsx。本コンポーネントは画像を使わない場面の予備。
 */
export function SimpleTile({ read, riichi = false }: { read: ReadTile; riichi?: boolean }) {
  const review = needsReview(read);
  const face = tileFace(read.tile);

  return (
    <svg
      data-testid="tile"
      data-review={review ? "true" : undefined}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={tileLabel(read.tile)}
      style={{ margin: 2, verticalAlign: "middle" }}
    >
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={4}
        fill={review ? "#fff5f5" : "#ffffff"}
        stroke={review ? REVIEW_COLOR : "#cfcfcf"}
        strokeWidth={1.5}
      />

      {face.kind === "number" && (
        <>
          <text
            x={W / 2}
            y={19}
            textAnchor="middle"
            fontSize={17}
            fontWeight={700}
            fill={face.color}
          >
            {face.rank}
          </text>
          <text x={W / 2} y={32} textAnchor="middle" fontSize={11} fill={face.color}>
            {face.glyph}
          </text>
        </>
      )}

      {face.kind === "honor" && (
        <text x={W / 2} y={26} textAnchor="middle" fontSize={15} fontWeight={700} fill={face.color}>
          {face.glyph}
        </text>
      )}

      {face.kind === "unknown" && (
        <text x={W / 2} y={26} textAnchor="middle" fontSize={16} fill={face.color}>
          ?
        </text>
      )}

      {riichi && <rect x={5} y={H - 6} width={W - 10} height={2.5} rx={1} fill={REVIEW_COLOR} />}
    </svg>
  );
}
