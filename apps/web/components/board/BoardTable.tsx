"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { meldTileViews, needsReview, seatResult, type TileLocation } from "@rigel/ui";
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
  dora: Tile[];
  onOpenEdit: (e: React.MouseEvent, loc: TileLocation, code: Tile | null) => void;
  onOpenAdd: (e: React.MouseEvent, seat: Seat, area: "hand" | "river") => void;
  /** ネームプレート押下（視点切替）。指定時のみプレートがボタンになる（ビューアと同じ操作）。 */
  onSeatSelect?: (seat: Seat) => void;
}

/** 卓の見た目（中央情報＋4席の河/ネームプレート/手牌/鳴き）。閲覧ではなく編集用で、牌クリックで編集を開く。 */
export function BoardTable(p: BoardTableProps) {
  const { kifu, bottomSeat, dealer, sel, flashKey, names, showPoints, points } = p;

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
              {p.dora.length === 0 ? (
                <DoraGlyph code={null} />
              ) : (
                p.dora.map((t, i) => <DoraGlyph key={`${t}-${i}`} code={t} />)
              )}
            </div>
          </div>

          {SLOTS.map(({ cam, cls }) => {
            const seat = toAbsoluteSeat(cam, bottomSeat);
            const board = kifu.seats[seat];
            const wind = windOf(seat, dealer);
            const win = kifu.agari.some((a) => a.winner === seat);
            const rows = chunk(board.river, 6);
            // ネームプレートの中身。視点切替（onSeatSelect）ありならボタン、無ければ div に載せる
            // （ViewBoard と同じ構成）。
            const plate = (
              <>
                <span className={s.wd}>{wind}</span>
                <span className={s.nm}>{names[seat] || `${wind}家`}</span>
                {seatResult(kifu.agari, seat) && (
                  <span className={s.sc}>{seatResult(kifu.agari, seat)}</span>
                )}
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
              </>
            );
            return (
              <div key={cam} className={`${s.seat} ${cls}`} data-seat={cam}>
                <div className={s.river}>
                  {(() => {
                    // 河は6枚/段。最終段が満杯(6枚)なら追加(+)は次段の先頭に置く
                    //（=7枚目から2段目）。埋まっていない段には末尾に + を付ける。
                    const lastFull = rows.length > 0 && rows[rows.length - 1]!.length >= 6;
                    const addBtn = (
                      <button
                        type="button"
                        className={`${s.tile} ${s.riverT} ${s.addslot}`}
                        aria-label={`${wind}家に捨て牌を追加`}
                        onClick={(e) => p.onOpenAdd(e, seat, "river")}
                      >
                        +
                      </button>
                    );
                    return (
                      <>
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
                                  called={!!d.calledBy}
                                  review={needsReview(d)}
                                  selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                                  flash={flashKey === fkey(loc)}
                                  label={`${wind}家の河 ${index + 1}枚目`}
                                  onClick={(e) => p.onOpenEdit(e, loc, d.tile)}
                                />
                              );
                            })}
                            {ri === rows.length - 1 && !lastFull && addBtn}
                          </div>
                        ))}
                        {(rows.length === 0 || lastFull) && <div className={s.rrow}>{addBtn}</div>}
                      </>
                    );
                  })()}
                </div>

                {p.onSeatSelect ? (
                  <button
                    type="button"
                    className={`${s.nameplate} ${s.plateBtn} ${win ? s.win : ""}`}
                    aria-label={`${wind}家の視点にする`}
                    onClick={() => p.onSeatSelect?.(seat)}
                  >
                    {plate}
                  </button>
                ) : (
                  <div className={`${s.nameplate} ${win ? s.win : ""}`}>{plate}</div>
                )}

                <div className={s.hand}>
                  {/* この行は最終手牌ではなく配牌。ラベルで明示する（mobile の編集画面と同じ呼称）。 */}
                  <span className={s.handLabel}>配牌</span>
                  {board.hand.map((h, hi) => {
                    const loc: TileLocation = { seat, area: "hand", index: hi };
                    return (
                      <BoardTile
                        key={hi}
                        code={h.tile}
                        review={needsReview(h)}
                        selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                        flash={flashKey === fkey(loc)}
                        label={`${wind}家の配牌`}
                        onClick={(e) => p.onOpenEdit(e, loc, h.tile)}
                      />
                    );
                  })}
                  {board.hand.length < 14 && (
                    <button
                      type="button"
                      className={`${s.tile} ${s.addslot}`}
                      aria-label={`${wind}家の配牌に追加`}
                      onClick={(e) => p.onOpenAdd(e, seat, "hand")}
                    >
                      +
                    </button>
                  )}
                  {board.melds.length > 0 && (
                    <div className={s.melds}>
                      {/* 鳴きの向き・暗槓の背面は共有ルール（meldTileViews）。
                          横向きの位置が鳴き元を示す（上家=左端・対面=左から2枚目・下家=右端）。 */}
                      {board.melds.map((md, mi) => {
                        const views = meldTileViews(md, seat);
                        return (
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
                                  lay={views[ti]?.lay}
                                  back={views[ti]?.back}
                                  review={needsReview(t)}
                                  selected={sel?.kind === "edit" && fkey(sel.loc) === fkey(loc)}
                                  label={`${wind}家の鳴き`}
                                  onClick={(e) => p.onOpenEdit(e, loc, t.tile)}
                                />
                              );
                            })}
                          </div>
                        );
                      })}
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
