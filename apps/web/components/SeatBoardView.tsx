import type { Seat, SeatBoard } from "@rigel/schema";
import { seatLabel, tileLabel } from "@rigel/ui";
import { Tile } from "./Tile";

/** 1席ぶんの盤面（手牌・鳴き・河）。 */
export function SeatBoardView({ seat, board }: { seat: Seat; board: SeatBoard }) {
  return (
    <section style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 8 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{seatLabel(seat)}家</h3>

      {board.hand.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <small style={{ color: "#666" }}>手牌</small>
          <div>
            {board.hand.map((t, i) => (
              <Tile key={i} read={t} />
            ))}
          </div>
        </div>
      )}

      {board.melds.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <small style={{ color: "#666" }}>鳴き</small>
          <div>
            {board.melds.map((m, i) => (
              <span key={i} style={{ marginRight: 8 }}>
                {m.tiles.map((t, j) => (
                  <Tile key={j} read={t} />
                ))}
                <small style={{ color: "#999" }}>
                  ({m.type}
                  {m.from ? `←${seatLabel(m.from)}` : ""})
                </small>
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <small style={{ color: "#666" }}>河</small>
        <div>
          {board.river.length === 0 ? (
            <small style={{ color: "#bbb" }}>—</small>
          ) : (
            board.river.map((d, i) => (
              <span key={i} title={d.riichi ? `リーチ宣言牌: ${tileLabel(d.tile)}` : undefined}>
                <Tile read={d} riichi={d.riichi} />
              </span>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
