"use client";

import {
  KifuSchema,
  type DiscardEvent,
  type Kifu,
  type Meld,
  type MeldType,
  type Seat,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import {
  deriveTimeline,
  nextDiscardSeat,
  seatLabel,
  syncSeatsFromTimeline,
  timelineTurns,
} from "@rigel/ui";
import { useState } from "react";
import { OssTileFace } from "../OssTileFace";
import { NUMS, SEAT_ORDER, SUITS, type Suit } from "../../lib/board";
import s from "./timeline-editor.module.css";

const MELD_TYPES: MeldType[] = ["pon", "chi", "kan_open", "kan_closed", "kan_added"];
const MELD_LABEL: Record<MeldType, string> = {
  pon: "ポン",
  chi: "チー",
  kan_open: "大明槓",
  kan_closed: "暗槓",
  kan_added: "加槓",
};
const isKan = (t: MeldType) => t === "kan_open" || t === "kan_closed" || t === "kan_added";

const nextSeat = (seat: Seat): Seat => SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % 4]!;
const nextFrom = (from: Seat | null, self: Seat): Seat => {
  let i = SEAT_ORDER.indexOf(from ?? self);
  do {
    i = (i + 1) % 4;
  } while (SEAT_ORDER[i] === self);
  return SEAT_ORDER[i]!;
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

  /** ピッカーの編集対象に現在入っている牌（選択ハイライトに使う）。 */
  function currentOf(t: PickTarget): Tile | null {
    const e = timeline[t.index];
    if (!e) return null;
    if (e.kind === "discard") return t.kind === "draw" ? e.draw : e.tile;
    if (t.kind === "mtile") return e.meld.tiles[t.ti]?.tile ?? null;
    return null;
  }

  /** ピッカーを開く。スートタブは現在の牌に合わせる（毎回萬に戻さない）。 */
  function openPick(t: PickTarget) {
    const cur = currentOf(t);
    setPickSuit((cur?.[1] as Suit) ?? "m");
    setPick(t);
  }
  const pickCurrent = pick ? currentOf(pick) : null;

  /** 新しい timeline を正典にして盤面を同期し、親へ返す。 */
  function commit(next: TimelineEvent[]) {
    onChange(syncSeatsFromTimeline(KifuSchema.parse({ ...kifu, timeline: next })));
  }
  function update(index: number, fn: (e: TimelineEvent) => TimelineEvent) {
    commit(timeline.map((e, i) => (i === index ? fn(e) : e)));
  }
  /** 打牌イベントだけを更新する（種別ガードを1か所に集約）。 */
  function updateDiscard(index: number, fn: (e: DiscardEvent) => DiscardEvent) {
    update(index, (e) => (e.kind === "discard" ? fn(e) : e));
  }
  /** 鳴きイベントの Meld だけを更新する。 */
  function updateMeld(index: number, fn: (m: Meld) => Meld) {
    update(index, (e) => (e.kind === "meld" ? { ...e, meld: fn(e.meld) } : e));
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = timeline.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    commit(next);
  }

  function onPick(code: Tile | null) {
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
    // 追加席は東南西北×巡目を順に埋める（必ず新巡目・東にならないように）。
    commit([
      ...timeline,
      {
        kind: "discard",
        seat: nextDiscardSeat(timeline, dealer),
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
          // 巡目見出しは「先頭」または「巡目が変わる位置」に出す。親の打牌位置基準だと
          // 並替で親の打牌より上に行が来たとき「1巡目より前」に見える領域ができるため。
          const showTurn = i === 0 || turns[i] !== turns[i - 1];
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
                    <button className={s.tp} onClick={() => openPick({ kind: "draw", index: i })}>
                      <span className={s.lab}>ツモ</span>
                      <TileBox code={e.draw} />
                    </button>
                    <button
                      className={s.tp}
                      disabled={e.tsumogiri}
                      onClick={() => openPick({ kind: "disc", index: i })}
                    >
                      <span className={s.lab}>打</span>
                      <TileBox code={e.tile} />
                    </button>
                    <button
                      className={`${s.mode} ${e.tsumogiri ? s.tsumogiri : s.tegiri}`}
                      onClick={() =>
                        updateDiscard(i, (x) => ({
                          ...x,
                          tsumogiri: !x.tsumogiri,
                          tile: !x.tsumogiri ? x.draw : x.tile,
                        }))
                      }
                    >
                      {e.tsumogiri ? "ツモ切り" : "手出し"}
                    </button>
                    <button
                      className={`${s.riichi} ${e.riichi ? s.on : ""}`}
                      onClick={() => updateDiscard(i, (x) => ({ ...x, riichi: !x.riichi }))}
                    >
                      リーチ
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={s.kind}
                      onClick={() =>
                        updateMeld(i, (m) => {
                          const type = MELD_TYPES[(MELD_TYPES.indexOf(m.type) + 1) % 5]!;
                          const n = isKan(type) ? 4 : 3;
                          const tiles = Array.from(
                            { length: n },
                            (_, k) => m.tiles[k] ?? m.tiles[0] ?? { tile: null, confidence: 1 },
                          );
                          const from =
                            type === "kan_closed" ? null : (m.from ?? nextFrom(null, e.seat));
                          return { type, tiles, from };
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
                          onClick={() => openPick({ kind: "mtile", index: i, ti })}
                        >
                          <TileBox code={rt.tile} small />
                        </button>
                      ))}
                    </span>
                    {e.meld.type !== "kan_closed" && (
                      <button
                        className={s.from}
                        onClick={() =>
                          updateMeld(i, (m) => ({ ...m, from: nextFrom(m.from, e.seat) }))
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
                  key={su.suit}
                  className={pickSuit === su.suit ? s.on : ""}
                  onClick={() => setPickSuit(su.suit)}
                >
                  {su.label}
                </button>
              ))}
            </div>
            <div className={s.pgrid}>
              {NUMS[pickSuit].map((code) => (
                <button
                  key={code}
                  className={`${s.pcell} ${pickCurrent === code ? s.on : ""}`}
                  aria-pressed={pickCurrent === code}
                  onClick={() => onPick(code)}
                >
                  <OssTileFace code={code} />
                </button>
              ))}
            </div>
            <button className={s.pclear} onClick={() => onPick(null)}>
              クリア（なし）
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

function TileBox({ code, small }: { code: Tile | null; small?: boolean }) {
  return (
    <span className={`${s.tbox} ${small ? s.tboxSm : ""}`}>
      {code ? <OssTileFace code={code} /> : <span className={s.none}>—</span>}
    </span>
  );
}
