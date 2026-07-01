"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { needsReview, type TileLocation } from "@rigel/ui";
import { chunk, windOf } from "../../lib/board";
import { fkey, fmtPts, type Selection } from "./shared";
import { BoardTile, DoraGlyph } from "./tiles";
import s from "./board-editor.module.css";

const SLOTS: { cam: CameraSeat; cls: string }[] = [
  { cam: "bottom", cls: s.seatB },
  { cam: "right", cls: s.seatR },
  { cam: "top", cls: s.seatT },
  { cam: "left", cls: s.seatL },
];

export interface BoardTableProps {
  kifu: Kifu;
  bottomSeat: Seat;
  dealer: Seat;
  scale: number;
  mainRef: React.RefObject<HTMLDivElement | null>;
  sel: Selection;
  flashKey: string | null;
  names: Record<Seat, string>;
  showPoints: boolean;
  points: Record<Seat, string>;
  honba: number;
  kyotaku: number;
  round: string;
  dora: Tile | null;
  onOpenEdit: (e: React.MouseEvent, loc: TileLocation, code: Tile | null) => void;
  onOpenAdd: (e: React.MouseEvent, seat: Seat, area: "hand" | "river") => void;
}

/** 卓の見た目（中央情報＋4席の河/ネームプレート/手牌/鳴き）。閲覧ではなく編集用で、牌クリックで編集を開く。 */
export function BoardTable(p: BoardTableProps) {
  const { kifu, bottomSeat, dealer, sel, flashKey, names, showPoints, points } = p;

  // 席の結果表示（和了はネームプレートに出す）。agari（配列）が単一の真実源。
  const seatResult = (seat: Seat): string => {
    const won = kifu.agari.find((a) => a.winner === seat);
    if (won) return won.from ? "ロン" : "ツモ";
    if (kifu.agari.some((a) => a.from === seat)) return "放銃";
    return "";
  };

  return (
    <div className={s.main} ref={p.mainRef}>
      <div className={s.stage} style={{ height: 768 * p.scale }}>
        <div
          className={s.table}
          style={{ transform: `scale(${p.scale})` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={s.center}>
            <div className={s.rd}>
              {p.round} <span className={s.hb}>{p.honba}本場</span>
            </div>
            {p.kyotaku > 0 && (
              <div className={s.kyotaku}>
                供託 <b>{p.kyotaku}</b>本
              </div>
            )}
            <div className={s.dora}>
              <DoraGlyph code={p.dora} />
            </div>
          </div>

          {SLOTS.map(({ cam, cls }) => {
            const seat = toAbsoluteSeat(cam, bottomSeat);
            const board = kifu.seats[seat];
            const wind = windOf(seat, dealer);
            const win = kifu.agari.some((a) => a.winner === seat);
            const rows = chunk(board.river, 6);
            return (
              <div key={cam} className={`${s.seat} ${cls}`}>
                <div className={s.river}>
                  {rows.map((row, ri) => (
                    <div key={ri} className={s.rrow}>
                      {row.map((d, ci) => {
                        const index = ri * 6 + ci;
                        const loc: TileLocation = { seat, area: "river", index };
                        return (
                          <BoardTile
                            key={ci}
                            code={d.tile}
                            kind="river"
                            lay={d.riichi}
                            tsumogiri={d.tsumogiri}
                            review={needsReview(d)}
                            selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                            flash={flashKey === fkey(loc)}
                            label={`${wind}家の河 ${index + 1}枚目`}
                            onClick={(e) => p.onOpenEdit(e, loc, d.tile)}
                          />
                        );
                      })}
                      {ri === rows.length - 1 && (
                        <button
                          type="button"
                          className={`${s.tile} ${s.riverT} ${s.addslot}`}
                          aria-label={`${wind}家に捨て牌を追加`}
                          onClick={(e) => p.onOpenAdd(e, seat, "river")}
                        >
                          +
                        </button>
                      )}
                    </div>
                  ))}
                  {rows.length === 0 && (
                    <div className={s.rrow}>
                      <button
                        type="button"
                        className={`${s.tile} ${s.riverT} ${s.addslot}`}
                        aria-label={`${wind}家に捨て牌を追加`}
                        onClick={(e) => p.onOpenAdd(e, seat, "river")}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>

                <div className={`${s.nameplate} ${win ? s.win : ""}`}>
                  <span className={s.wd}>{wind}</span>
                  <span className={s.nm}>{names[seat] || `${wind}家`}</span>
                  {seatResult(seat) && <span className={s.sc}>{seatResult(seat)}</span>}
                  {showPoints && (
                    <span
                      style={{
                        color: "var(--orange)",
                        fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        fontSize: 12,
                      }}
                    >
                      {fmtPts(points[seat])}
                    </span>
                  )}
                </div>

                <div className={s.hand}>
                  {board.hand.map((h, hi) => {
                    const loc: TileLocation = { seat, area: "hand", index: hi };
                    return (
                      <BoardTile
                        key={hi}
                        code={h.tile}
                        review={needsReview(h)}
                        selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                        flash={flashKey === fkey(loc)}
                        label={`${wind}家の手牌`}
                        onClick={(e) => p.onOpenEdit(e, loc, h.tile)}
                      />
                    );
                  })}
                  {board.hand.length < 14 && (
                    <button
                      type="button"
                      className={`${s.tile} ${s.addslot}`}
                      aria-label={`${wind}家の手牌に追加`}
                      onClick={(e) => p.onOpenAdd(e, seat, "hand")}
                    >
                      +
                    </button>
                  )}
                  {board.melds.length > 0 && (
                    <div className={s.melds}>
                      {board.melds.map((md, mi) => (
                        <div key={mi} className={s.meld}>
                          {md.tiles.map((t, ti) => {
                            const loc: TileLocation = {
                              seat,
                              area: "meld",
                              meldIndex: mi,
                              index: ti,
                            };
                            return (
                              <BoardTile
                                key={ti}
                                code={t.tile}
                                kind="meld"
                                lay={ti === 0}
                                review={needsReview(t)}
                                selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                                label={`${wind}家の鳴き`}
                                onClick={(e) => p.onOpenEdit(e, loc, t.tile)}
                              />
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
