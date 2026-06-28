import type { ReadTile } from "@rigel/schema";
import { describeTile, needsReview, tileLabel, type Suit } from "@rigel/ui";

const SUIT_COLOR: Record<Suit, string> = { m: "#b00020", p: "#0b5cad", s: "#1b7a2f", z: "#333" };

/** 1牌の表示。確信度が低い/読めない牌は枠を強調して「要確認」を示す。 */
export function Tile({ read }: { read: ReadTile }) {
  const review = needsReview(read);
  const info = describeTile(read.tile);
  const color = info?.red ? "#d00" : info ? SUIT_COLOR[info.suit] : "#999";
  return (
    <span
      data-testid="tile"
      data-review={review ? "true" : undefined}
      title={`confidence ${read.confidence}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 36,
        padding: "0 4px",
        margin: 2,
        borderRadius: 4,
        border: `2px solid ${review ? "crimson" : "#ccc"}`,
        background: review ? "#fff5f5" : "#fff",
        color,
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {tileLabel(read.tile)}
    </span>
  );
}
