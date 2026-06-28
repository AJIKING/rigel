"use client";

import { TILE_VALUES, type Tile as TileCode } from "@rigel/schema";
import { Tile } from "./Tile";

const pickBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  padding: 0,
};

/** 正しい牌を選ぶグリッド（34種 + 「不明」）。修正UIから使う。 */
export function TilePicker({ onPick }: { onPick: (tile: TileCode | null) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 2, maxWidth: 360 }}>
      {TILE_VALUES.map((t) => (
        <button
          key={t}
          type="button"
          data-testid="pick-tile"
          aria-label={t}
          onClick={() => onPick(t)}
          style={pickBtn}
        >
          <Tile read={{ tile: t, confidence: 1 }} />
        </button>
      ))}
      <button
        type="button"
        data-testid="pick-null"
        onClick={() => onPick(null)}
        style={{ ...pickBtn, alignSelf: "center", color: "#888", fontSize: 13, padding: "0 6px" }}
      >
        不明のまま
      </button>
    </div>
  );
}
