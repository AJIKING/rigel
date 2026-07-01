"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
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
  onClose: () => void;
}

/** 牌を選ぶポップアップ。編集対象が河/手牌なら捨て方・リーチ・鳴きの追加操作も出す。
 *  position:fixed で盤面の overflow に切られない前提（背後クリックで閉じるオーバーレイ込み）。 */
export function TilePickerPopup(p: TilePickerPopupProps) {
  const { sel, kifu, meldType, bottomSeat, dealer, names } = p;
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
            <button key={code} className={s.pk} onClick={() => p.onApplyTile(code)}>
              <span className={s.tile}>
                <OssTileFace code={code} />
              </span>
            </button>
          ))}
        </div>
        {sel?.kind === "edit" && sel.loc.area !== "meld" && (
          <div className={s.meldEdit}>
            {sel.loc.area === "river" && (
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
                      className={
                        (kifu.seats[sel.loc.seat].river[sel.loc.index]?.tsumogiri ?? false) === tg
                          ? s.on
                          : ""
                      }
                      onClick={() => p.onSetDiscardKind(tg)}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {sel.loc.area === "river" && (
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
                      className={
                        (kifu.seats[sel.loc.seat].river[sel.loc.index]?.riichi ?? false) === rc
                          ? s.on
                          : ""
                      }
                      onClick={() => p.onSetDiscardRiichi(rc)}
                    >
                      {lbl}
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
      </div>
    </>
  );
}
