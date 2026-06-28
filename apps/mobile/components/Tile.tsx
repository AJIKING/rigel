import type { ReadTile } from "@rigel/schema";
import { needsReview, REVIEW_COLOR, tileFace, tileLabel } from "@rigel/ui";
import Svg, { Rect, Text as SvgText } from "react-native-svg";

const W = 30;
const H = 40;

/**
 * 1牌の表示（RN / react-native-svg。web と同じ tileFace 仕様を描く）。
 * 数牌=数字+スート記号、字牌=漢字、赤ドラ=赤、読めない牌=?。要確認は赤枠。
 */
export function Tile({ read, riichi = false }: { read: ReadTile; riichi?: boolean }) {
  const review = needsReview(read);
  const face = tileFace(read.tile);

  return (
    <Svg width={W} height={H} accessibilityLabel={tileLabel(read.tile)} style={{ margin: 2 }}>
      <Rect
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
          <SvgText
            x={W / 2}
            y={20}
            fontSize={17}
            fontWeight="700"
            fill={face.color}
            textAnchor="middle"
          >
            {String(face.rank)}
          </SvgText>
          <SvgText x={W / 2} y={33} fontSize={11} fill={face.color} textAnchor="middle">
            {face.glyph}
          </SvgText>
        </>
      )}

      {face.kind === "honor" && (
        <SvgText
          x={W / 2}
          y={27}
          fontSize={15}
          fontWeight="700"
          fill={face.color}
          textAnchor="middle"
        >
          {face.glyph}
        </SvgText>
      )}

      {face.kind === "unknown" && (
        <SvgText x={W / 2} y={27} fontSize={16} fill={face.color} textAnchor="middle">
          ?
        </SvgText>
      )}

      {riichi && <Rect x={5} y={H - 6} width={W - 10} height={2.5} rx={1} fill={REVIEW_COLOR} />}
    </Svg>
  );
}
