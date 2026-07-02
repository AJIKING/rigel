"use client";

import {
  KifuSchema,
  type Kifu,
  type Meld,
  type MeldType,
  type Seat,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import { deriveTimeline, seatLabel, syncSeatsFromTimeline, timelineTurns } from "@rigel/ui";
import { useState } from "react";
import { OssTileFace } from "../OssTileFace";
import { NUMS, type Suit } from "../../lib/board";
import s from "./timeline-editor.module.css";

const SEATS: Seat[] = ["east", "south", "west", "north"];
const SUITS: { key: Suit; label: string }[] = [
  { key: "m", label: "萬" },
  { key: "p", label: "筒" },
  { key: "s", label: "索" },
  { key: "z", label: "字" },
];
const MELD_TYPES: MeldType[] = ["pon", "chi", "kan_open", "kan_closed", "kan_added"];
const MELD_LABEL: Record<MeldType, string> = {
  pon: "ポン",
  chi: "チー",
  kan_open: "大明槓",
  kan_closed: "暗槓",
  kan_added: "加槓",
};
const isKan = (t: MeldType) => t === "kan_open" || t === "kan_closed" || t === "kan_added";

const nextSeat = (seat: Seat): Seat => SEATS[(SEATS.indexOf(seat) + 1) % 4]!;
const nextFrom = (from: Seat | null, self: Seat): Seat => {
  let i = SEATS.indexOf(from ?? self);
  do {
    i = (i + 1) % 4;
  } while (SEATS[i] === self);
  return SEATS[i]!;
};

/** ピッカーの対象。draw/disc は打牌イベント、mtile は鳴き牌。 */
type PickTarget =
  | { kind: "draw"; index: number }
  | { kind: "disc"; index: number }
  | { kind: "mtile"; index: number; ti: number };

/**
 * 手順（タイムライン）エディタ。打牌・鳴きを時系列で並べ、ドラッグで順番入替、
 * 席・牌・手出し/ツモ切りをタップ編集する。編集結果は timeline を正典として
 * 盤面(席ごと)へ同期し onChange で返す。設計: docs/designs/timeline-editor.md
 */
export function TimelineEditor({
  kifu,
  dealer,
  names,
  onChange,
}: {
  kifu: Kifu;
  dealer: Seat;
  names: Record<Seat, string>;
  onChange: (kifu: Kifu) => void;
}) {
  const timeline = deriveTimeline(kifu);
  const turns = timelineTurns(timeline, dealer);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [pick, setPick] = useState<PickTarget | null>(null);
  const [pickSuit, setPickSuit] = useState<Suit>("m");

  /** 新しい timeline を正典にして盤面を同期し、親へ返す。 */
  function commit(next: TimelineEvent[]) {
    onChange(syncSeatsFromTimeline(KifuSchema.parse({ ...kifu, timeline: next })));
  }
  function update(index: number, fn: (e: TimelineEvent) => TimelineEvent) {
    commit(timeline.map((e, i) => (i === index ? fn(e) : e)));
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = timeline.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    commit(next);
  }

  function onPick(code: Tile) {
    if (!pick) return;
    const t = pick;
    update(t.index, (e) => {
      if (e.kind === "discard") {
        if (t.kind === "draw") {
          return { ...e, draw: code, tile: e.tsumogiri ? code : e.tile };
        }
        if (t.kind === "disc") return { ...e, tile: code };
        return e;
      }
      if (t.kind === "mtile") {
        const tiles = e.meld.tiles.map((rt, i) => (i === t.ti ? { ...rt, tile: code } : rt));
        return { ...e, meld: { ...e.meld, tiles } };
      }
      return e;
    });
    setPick(null);
  }

  function addDiscard() {
    commit([
      ...timeline,
      {
        kind: "discard",
        seat: dealer,
        draw: null,
        tile: null,
        tsumogiri: false,
        riichi: false,
        confidence: 1,
      },
    ]);
  }
  function addMeld() {
    const meld: Meld = {
      type: "pon",
      tiles: [
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
      ],
      from: nextFrom(null, dealer),
    };
    commit([...timeline, { kind: "meld", seat: dealer, meld }]);
  }

  return (
    <aside className={s.panel} onClick={(e) => e.stopPropagation()}>
      <div className={s.head}>
        <h2>手順</h2>
        <span className={s.sp} />
        <button className={s.addbtn} onClick={addDiscard}>
          ＋打牌
        </button>
        <button className={s.addbtn} onClick={addMeld}>
          ＋鳴き
        </button>
      </div>
      <p className={s.hint}>行をドラッグで順番入替。席・牌・手出し/ツモ切りはタップで編集。</p>

      <div className={s.list}>
        {timeline.length === 0 && (
          <p className={s.empty}>まだ打牌がありません。「＋打牌」で追加してください。</p>
        )}
        {timeline.map((e, i) => {
          const showTurn = e.kind === "discard" && e.seat === dealer;
          return (
            <div key={i}>
              {showTurn && (
                <div className={s.turn}>
                  <b>{turns[i]}巡目</b>
                </div>
              )}
              <div
                className={`${s.ev} ${e.kind === "meld" ? s.meldEv : ""} ${dragIdx === i ? s.dragging : ""}`}
                draggable
                onDragStart={() => setDragIdx(i)}
                onDragEnd={() => setDragIdx(null)}
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null) reorder(dragIdx, i);
                  setDragIdx(null);
                }}
              >
                <span className={s.grip}>⋮⋮</span>
                <button
                  className={s.seat}
                  onClick={() => update(i, (x) => ({ ...x, seat: nextSeat(x.seat) }))}
                  title={names[e.seat] || undefined}
                >
                  {seatLabel(e.seat)}
                </button>

                {e.kind === "discard" ? (
                  <>
                    <button className={s.tp} onClick={() => setPick({ kind: "draw", index: i })}>
                      <span className={s.lab}>ツモ</span>
                      <TileBox code={e.draw} />
                    </button>
                    <span className={s.arr}>→</span>
                    <button
                      className={s.tp}
                      disabled={e.tsumogiri}
                      onClick={() => setPick({ kind: "disc", index: i })}
                    >
                      <span className={s.lab}>打</span>
                      <TileBox code={e.tile} />
                    </button>
                    <button
                      className={`${s.mode} ${e.tsumogiri ? s.tsumogiri : s.tegiri}`}
                      onClick={() =>
                        update(i, (x) =>
                          x.kind === "discard"
                            ? {
                                ...x,
                                tsumogiri: !x.tsumogiri,
                                tile: !x.tsumogiri ? x.draw : x.tile,
                              }
                            : x,
                        )
                      }
                    >
                      {e.tsumogiri ? "ツモ切り" : "手出し"}
                    </button>
                    <button
                      className={`${s.riichi} ${e.riichi ? s.on : ""}`}
                      onClick={() =>
                        update(i, (x) => (x.kind === "discard" ? { ...x, riichi: !x.riichi } : x))
                      }
                    >
                      リーチ
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={s.kind}
                      onClick={() =>
                        update(i, (x) => {
                          if (x.kind !== "meld") return x;
                          const type = MELD_TYPES[(MELD_TYPES.indexOf(x.meld.type) + 1) % 5]!;
                          const n = isKan(type) ? 4 : 3;
                          const tiles = Array.from(
                            { length: n },
                            (_, k) =>
                              x.meld.tiles[k] ?? x.meld.tiles[0] ?? { tile: null, confidence: 1 },
                          );
                          const from =
                            type === "kan_closed" ? null : (x.meld.from ?? nextFrom(null, x.seat));
                          return { ...x, meld: { type, tiles, from } };
                        })
                      }
                    >
                      {MELD_LABEL[e.meld.type]}
                    </button>
                    <span className={s.mtiles}>
                      {e.meld.tiles.map((rt, ti) => (
                        <button
                          key={ti}
                          className={s.mtileBtn}
                          onClick={() => setPick({ kind: "mtile", index: i, ti })}
                        >
                          <TileBox code={rt.tile} small />
                        </button>
                      ))}
                    </span>
                    {e.meld.type !== "kan_closed" && (
                      <button
                        className={s.from}
                        onClick={() =>
                          update(i, (x) =>
                            x.kind === "meld"
                              ? { ...x, meld: { ...x.meld, from: nextFrom(x.meld.from, x.seat) } }
                              : x,
                          )
                        }
                      >
                        {seatLabel(e.meld.from ?? nextFrom(null, e.seat))}
                        <b>から</b>
                      </button>
                    )}
                  </>
                )}

                <span className={s.sp} />
                <button
                  className={s.del}
                  onClick={() => commit(timeline.filter((_, k) => k !== i))}
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {pick && (
        <div className={s.pov} onClick={() => setPick(null)}>
          <div className={s.pcard} onClick={(e) => e.stopPropagation()}>
            <div className={s.ptabs}>
              {SUITS.map((su) => (
                <button
                  key={su.key}
                  className={pickSuit === su.key ? s.on : ""}
                  onClick={() => setPickSuit(su.key)}
                >
                  {su.label}
                </button>
              ))}
            </div>
            <div className={s.pgrid}>
              {pickCodes(pickSuit).map((code) => (
                <button key={code} className={s.pcell} onClick={() => onPick(code)}>
                  <OssTileFace code={code} />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

/** ピッカーのその色の候補牌（NUMS: 1..9 + 赤5、字は1..7）。 */
function pickCodes(suit: Suit): Tile[] {
  return NUMS[suit];
}

function TileBox({ code, small }: { code: Tile | null; small?: boolean }) {
  return (
    <span className={`${s.tbox} ${small ? s.tboxSm : ""}`}>
      {code ? <OssTileFace code={code} /> : <span className={s.none}>—</span>}
    </span>
  );
}
