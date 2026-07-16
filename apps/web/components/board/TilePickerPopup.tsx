"use client";

import { toAbsoluteSeat, type CameraSeat, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { chiRunLabel, chiVariants } from "@rigel/ui";
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
  /** チーの並び（選んだ順子。null=自動）。「並び」行で選ぶ。 */
  chiRun: Tile[] | null;
  setChiRun: (run: Tile[] | null) => void;
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

  // 「この捨て牌を鳴く」対象（河の牌の編集時のみ）。
  // 鳴かれた牌・捨て主（from）は対象から決まるので、選ぶのは鳴いた人と切った牌だけ。
  const callTarget =
    sel?.kind === "edit" && sel.loc.area === "river"
      ? { discarder: sel.loc.seat, index: sel.loc.index }
      : null;
  // チー並びの基準牌（捨て牌から鳴く=鳴かれた牌そのもの）。
  const chiBase = callTarget
    ? (kifu.seats[callTarget.discarder].river[callTarget.index]?.tile ?? null)
    : current;
  // 鳴き操作を出すか: 捨て牌を鳴く（編集時）か、配牌側（手牌）の鳴き作成。
  // 河への追加中は出さない（鳴きは捨て牌をタップして付ける＝mobile と同じ整理）。
  const showMeld =
    callTarget !== null ||
    (sel?.kind === "add" && sel.area === "hand") ||
    (sel?.kind === "edit" && sel.loc.area === "hand");

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
            {showMeld && (
              <div className={s.meRow}>
                <span className={s.meLabel}>鳴き</span>
                <div className={s.meSeg}>
                  {(["none", "chi", "pon", "kan"] as const).map((mt) => (
                    <button
                      key={mt}
                      className={meldType === mt ? s.on : ""}
                      aria-pressed={meldType === mt}
                      onClick={() => p.setMeldType(mt)}
                    >
                      {{ none: "なし", chi: "チー", pon: "ポン", kan: "カン" }[mt]}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {showMeld && meldType !== "none" && (
              <>
                <div className={s.meRow}>
                  <span className={s.meLabel}>鳴いた人</span>
                  <div className={s.meSeg}>
                    {(["bottom", "right", "top", "left"] as const).map((cam) => {
                      const abs = toAbsoluteSeat(cam, bottomSeat);
                      // 捨て牌からの鳴きで、捨て主自身は鳴けないので出さない。
                      if (callTarget && abs === callTarget.discarder) return null;
                      return (
                        <button
                          key={cam}
                          className={p.meldWho === cam ? s.on : ""}
                          aria-pressed={p.meldWho === cam}
                          onClick={() => p.setMeldWho(cam)}
                        >
                          {names[abs] || `${windOf(abs, dealer)}家`}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {/* チーの並び（鳴かれた牌/編集中の牌を含む順子の候補）。 */}
                {meldType === "chi" && chiBase && chiVariants(chiBase).length > 0 && (
                  <div className={s.meRow}>
                    <span className={s.meLabel}>並び</span>
                    <div className={s.meSeg}>
                      {chiVariants(chiBase).map((run) => {
                        const key = run.join(",");
                        const label = chiRunLabel(run);
                        return (
                          <button
                            key={key}
                            className={p.chiRun?.join(",") === key ? s.on : ""}
                            aria-pressed={p.chiRun?.join(",") === key}
                            onClick={() => p.setChiRun(run)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {/* 捨て牌からのカンは大明槓しかない（暗槓/加槓は捨て牌を取らない）ので種類は出さない。 */}
                {meldType === "kan" && !callTarget && (
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
                <p className={s.meHint}>
                  {callTarget
                    ? "牌を選ぶと、鳴いた人がその後に切った牌になります"
                    : "牌を選ぶと鳴きを作成します"}
                </p>
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
