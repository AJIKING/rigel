"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { otherSeats } from "@rigel/ui";
import { NUMS, SUITS, windOf, type Suit } from "../../lib/board";
import { OssTileFace } from "../OssTileFace";
import { type Selection } from "./shared";
import s from "./board-editor.module.css";

export type MeldType = "none" | "chi" | "pon" | "kan";
export type KanType = "minkan" | "ankan" | "kakan";

export interface TilePickerPopupProps {
  pos: { x: number; y: number };
  suit: Suit;
  setSuit: (su: Suit) => void;
  sel: Selection;
  kifu: Kifu;
  /** 河への追加時に「これから追加する牌」へ適用する捨て方/リーチ（BoardEditor が保持）。 */
  addTsumogiri: boolean;
  addRiichi: boolean;
  meldType: MeldType;
  setMeldType: (m: MeldType) => void;
  meldWho: CameraSeat;
  setMeldWho: (c: CameraSeat) => void;
  kanType: KanType;
  setKanType: (k: KanType) => void;
  bottomSeat: Seat;
  dealer: Seat;
  names: Record<Seat, string>;
  onApplyTile: (code: Tile) => void;
  onSetDiscardKind: (tsumogiri: boolean) => void;
  onSetDiscardRiichi: (riichi: boolean) => void;
  /** 鳴かれた捨て牌の印（誰が鳴いたか。null=鳴かれていない）。河の牌の編集時のみ。 */
  onSetDiscardCalledBy: (calledBy: Seat | null) => void;
  /** 編集中の牌（手牌/河）または鳴きを取り除く（mobile の「削除」と同等）。 */
  onDelete: () => void;
  onClose: () => void;
}

/** 牌を選ぶポップアップ。対象が河/手牌なら（追加・編集どちらでも）捨て方・リーチ・鳴きの操作も出す。
 *  position:fixed で盤面の overflow に切られない前提（背後クリックで閉じるオーバーレイ込み）。 */
export function TilePickerPopup(p: TilePickerPopupProps) {
  const { sel, kifu, meldType, bottomSeat, dealer, names } = p;

  // 編集対象に現在入っている牌（グリッドの選択ハイライトに使う）。追加(add)時は無し。
  const current: Tile | null = (() => {
    if (sel?.kind === "edit") {
      const { seat, area, index, meldIndex } = sel.loc;
      const board = kifu.seats[seat];
      if (area === "hand") return board.hand[index]?.tile ?? null;
      if (area === "river") return board.river[index]?.tile ?? null;
      return board.melds[meldIndex ?? 0]?.tiles[index]?.tile ?? null;
    }
    if (sel?.kind === "dora")
      return sel.index !== undefined ? (kifu.meta.dora[sel.index] ?? null) : null;
    if (sel?.kind === "uradora")
      return sel.index !== undefined ? (kifu.meta.uraDora[sel.index] ?? null) : null;
    return null;
  })();

  // 捨て方/リーチの表示値。編集=その牌の現在値、追加=これから追加する牌へ適用する値。
  const riverFlags: { tsumogiri: boolean; riichi: boolean } | null = (() => {
    if (sel?.kind === "edit" && sel.loc.area === "river") {
      const discard = kifu.seats[sel.loc.seat].river[sel.loc.index];
      return { tsumogiri: discard?.tsumogiri ?? false, riichi: discard?.riichi ?? false };
    }
    if (sel?.kind === "add" && sel.area === "river") {
      return { tsumogiri: p.addTsumogiri, riichi: p.addRiichi };
    }
    return null;
  })();

  // 捨て方・リーチ・鳴きの操作ボックスを出すか（鳴きは meld 自体の編集時以外いつでも）。
  const showOps = sel?.kind === "add" || (sel?.kind === "edit" && sel.loc.area !== "meld");

  // 「鳴かれた」（この捨て牌を誰が鳴いたか）。既存の河の牌の編集時だけ出す。
  const calledEdit =
    sel?.kind === "edit" && sel.loc.area === "river"
      ? {
          discarder: sel.loc.seat,
          calledBy: kifu.seats[sel.loc.seat].river[sel.loc.index]?.calledBy ?? null,
        }
      : null;
  const calledCandidates = calledEdit ? otherSeats(calledEdit.discarder) : [];

  return (
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 199 }}
        onClick={(e) => {
          e.stopPropagation();
          p.onClose();
        }}
      />
      <div
        className={s.tilepop}
        style={{ left: p.pos.x, top: p.pos.y }}
        role="dialog"
        aria-label="牌を選ぶ"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.tabs}>
          {SUITS.map((su) => (
            <button
              key={su.suit}
              className={p.suit === su.suit ? s.on : ""}
              onClick={() => p.setSuit(su.suit)}
            >
              {su.label}
            </button>
          ))}
        </div>
        <div className={s.pgrid}>
          {NUMS[p.suit].map((code) => (
            <button
              key={code}
              className={`${s.pk} ${current === code ? s.pkOn : ""}`}
              aria-pressed={current === code}
              onClick={() => p.onApplyTile(code)}
            >
              <span className={s.tile}>
                <OssTileFace code={code} />
              </span>
            </button>
          ))}
        </div>
        {showOps && (
          <div className={s.meldEdit}>
            {riverFlags && (
              <div className={s.meRow}>
                <span className={s.meLabel}>捨て方</span>
                <div className={s.meSeg}>
                  {(
                    [
                      [false, "手出し"],
                      [true, "自摸切り"],
                    ] as const
                  ).map(([tg, lbl]) => (
                    <button
                      key={lbl}
                      className={riverFlags.tsumogiri === tg ? s.on : ""}
                      onClick={() => p.onSetDiscardKind(tg)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {riverFlags && (
              <div className={s.meRow}>
                <span className={s.meLabel}>リーチ宣言牌</span>
                <div className={s.meSeg}>
                  {(
                    [
                      [false, "通常"],
                      [true, "リーチ（横向き）"],
                    ] as const
                  ).map(([rc, lbl]) => (
                    <button
                      key={lbl}
                      className={riverFlags.riichi === rc ? s.on : ""}
                      onClick={() => p.onSetDiscardRiichi(rc)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {calledEdit && (
              <div className={s.meRow}>
                <span className={s.meLabel}>鳴かれた</span>
                <div className={s.meSeg}>
                  <button
                    className={calledEdit.calledBy === null ? s.on : ""}
                    onClick={() => p.onSetDiscardCalledBy(null)}
                  >
                    なし
                  </button>
                  {calledCandidates.map((abs) => (
                    <button
                      key={abs}
                      className={calledEdit.calledBy === abs ? s.on : ""}
                      onClick={() => p.onSetDiscardCalledBy(abs)}
                    >
                      {names[abs] || `${windOf(abs, dealer)}家`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className={s.meRow}>
              <span className={s.meLabel}>鳴き</span>
              <div className={s.meSeg}>
                {(["none", "chi", "pon", "kan"] as const).map((mt) => (
                  <button
                    key={mt}
                    className={meldType === mt ? s.on : ""}
                    onClick={() => p.setMeldType(mt)}
                  >
                    {{ none: "なし", chi: "チー", pon: "ポン", kan: "カン" }[mt]}
                  </button>
                ))}
              </div>
            </div>
            {meldType !== "none" && (
              <>
                <div className={s.meRow}>
                  <span className={s.meLabel}>鳴いた人</span>
                  <div className={s.meSeg}>
                    {(["bottom", "right", "top", "left"] as const).map((cam) => {
                      const abs = toAbsoluteSeat(cam, bottomSeat);
                      return (
                        <button
                          key={cam}
                          className={p.meldWho === cam ? s.on : ""}
                          onClick={() => p.setMeldWho(cam)}
                        >
                          {names[abs] || `${windOf(abs, dealer)}家`}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {meldType === "kan" && (
                  <div className={s.meRow}>
                    <span className={s.meLabel}>種類</span>
                    <div className={s.meSeg}>
                      {(
                        [
                          ["minkan", "大明槓"],
                          ["ankan", "暗槓"],
                          ["kakan", "加槓"],
                        ] as const
                      ).map(([k, lbl]) => (
                        <button
                          key={k}
                          className={p.kanType === k ? s.on : ""}
                          onClick={() => p.setKanType(k)}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className={s.meHint}>牌を選ぶと鳴きを作成します</p>
              </>
            )}
          </div>
        )}
        {/* 既存の牌/鳴きの編集時だけ削除を出す（追加中は対象が無い）。 */}
        {sel?.kind === "edit" && (
          <button className={s.pkDel} onClick={p.onDelete}>
            {sel.loc.area === "meld" ? "この鳴きを削除" : "この牌を削除"}
          </button>
        )}
      </div>
    </>
  );
}
