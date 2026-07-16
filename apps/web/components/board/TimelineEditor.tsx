"use client";

import {
  KifuSchema,
  type DiscardEvent,
  type Kifu,
  type Meld,
  type Seat,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import {
  calledByLabel,
  cycleEventSeat,
  cycleMeldFrom,
  cycleMeldType,
  deriveTimeline,
  makeDiscardEvent,
  nextDiscardSeat,
  nextMeldFrom,
  otherSeats,
  removeTimelineEvent,
  seatLabel,
  setTimelineCall,
  syncSeatsFromTimeline,
  timelineTurns,
  MELD_TYPE_LABELS,
} from "@rigel/ui";
import { useState } from "react";
import { OssTileFace } from "../OssTileFace";
import { NUMS, SUITS, type Suit } from "../../lib/board";
import s from "./timeline-editor.module.css";

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
  // 「鳴き」メニューを開いている打牌行（鳴いた人を選ぶ。null=閉）。
  const [callPick, setCallPick] = useState<number | null>(null);

  /** 席の表示名（選手名を優先。無名は「南家」のような席名）。 */
  const seatName = (seat: Seat) => names[seat] || `${seatLabel(seat)}家`;

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
    commit([...timeline, makeDiscardEvent(nextDiscardSeat(timeline, dealer))]);
  }
  function addMeld() {
    const meld: Meld = {
      type: "pon",
      tiles: [
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
      ],
      from: nextMeldFrom(null, dealer),
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
              {/* 巡目見出しもドロップ先にする（前の巡の末尾＝この巡の先頭へ移動できる）。 */}
              {showTurn && (
                <div
                  className={s.turn}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null) reorder(dragIdx, i);
                    setDragIdx(null);
                  }}
                >
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
                  onClick={() => commit(cycleEventSeat(timeline, i))}
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
                    {/* この捨て牌を誰が鳴いたか。メニューで鳴いた人を選ぶと、鳴き行と
                        「鳴いた人が切った牌」の行が直後に入る（河は薄表示になる）。 */}
                    <button
                      className={`${s.riichi} ${e.calledBy ? s.on : ""}`}
                      onClick={() => setCallPick(i)}
                    >
                      {calledByLabel(e.calledBy, e.calledBy ? names[e.calledBy] : null)}
                    </button>
                  </>
                ) : (
                  <>
                    <button className={s.kind} onClick={() => commit(cycleMeldType(timeline, i))}>
                      {MELD_TYPE_LABELS[e.meld.type]}
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
                      <button className={s.from} onClick={() => commit(cycleMeldFrom(timeline, i))}>
                        {seatName(e.meld.from ?? nextMeldFrom(null, e.seat))}
                        <b>から</b>
                      </button>
                    )}
                  </>
                )}

                <span className={s.sp} />
                <button
                  className={s.del}
                  onClick={() => commit(removeTimelineEvent(timeline, i))}
                  aria-label="削除"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
        {/* 末尾へのドロップ先（最後の行の下に落とせないと最後尾へ移動できない）。 */}
        {dragIdx !== null && timeline.length > 0 && (
          <div
            className={s.dropEnd}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={() => {
              if (dragIdx !== null) reorder(dragIdx, timeline.length - 1);
              setDragIdx(null);
            }}
          >
            ここで最後尾へ
          </div>
        )}
      </div>

      {callPick !== null &&
        (() => {
          const ev = timeline[callPick];
          if (ev?.kind !== "discard") return null;
          const choose = (seat: Seat | null) => {
            commit(setTimelineCall(timeline, callPick, seat));
            setCallPick(null);
          };
          return (
            <div className={s.pov} onClick={() => setCallPick(null)}>
              <div className={s.pcard} onClick={(e) => e.stopPropagation()}>
                <p className={s.callTitle}>この捨て牌を鳴いた人</p>
                <div className={s.callSeats}>
                  <button className={ev.calledBy === null ? s.on : ""} onClick={() => choose(null)}>
                    なし
                  </button>
                  {otherSeats(ev.seat).map((seat) => (
                    <button
                      key={seat}
                      className={ev.calledBy === seat ? s.on : ""}
                      onClick={() => choose(seat)}
                    >
                      {seatName(seat)}
                    </button>
                  ))}
                </div>
                <p className={s.callHint}>選ぶと手順に鳴きと「鳴いた人が切った牌」の行が入ります</p>
              </div>
            </div>
          );
        })()}

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
