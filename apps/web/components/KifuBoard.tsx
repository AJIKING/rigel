import type { Kifu, Seat } from "@rigel/schema";
import { SeatBoardView } from "./SeatBoardView";

const SEATS: Seat[] = ["east", "south", "west", "north"];

// 卓を上から見た配置で4席を並べる。
const AREA: Record<Seat, string> = {
  north: "north",
  west: "west",
  east: "east",
  south: "south",
};

/** 牌譜1件の盤面表示（4席を卓状にレイアウト）。 */
export function KifuBoard({ kifu }: { kifu: Kifu }) {
  return (
    <div
      data-testid="kifu-board"
      style={{
        display: "grid",
        gap: 8,
        gridTemplateColumns: "1fr 1fr 1fr",
        gridTemplateAreas: ['". north ."', '"west center east"', '". south ."'].join(" "),
      }}
    >
      {SEATS.map((seat) => (
        <div key={seat} style={{ gridArea: AREA[seat] }}>
          <SeatBoardView seat={seat} board={kifu.seats[seat]} />
        </div>
      ))}
      <div
        style={{
          gridArea: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: 12,
        }}
      >
        {kifu.result ?? "—"}
      </div>
    </div>
  );
}
