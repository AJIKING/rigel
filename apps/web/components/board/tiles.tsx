"use client";

import { type Tile } from "@rigel/schema";
import { OssTileFace } from "../OssTileFace";
import s from "./board-editor.module.css";

/** 盤面上の1牌ボタン（河/手牌/鳴き共通）。状態はクラスの付け外しで表現する。 */
export function BoardTile({
  code,
  kind,
  lay,
  back,
  tsumogiri,
  review,
  selected,
  flash,
  called,
  label,
  onClick,
}: {
  code: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  /** 背面（暗槓の両端）。編集ボタンとしては生きたまま面だけ伏せる。 */
  back?: boolean;
  tsumogiri?: boolean;
  review?: boolean;
  selected?: boolean;
  flash?: boolean;
  /** 鳴かれた捨て牌（他家の鳴きへ移った牌）。河で薄表示にする。 */
  called?: boolean;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    back ? s.back : "",
    tsumogiri ? s.tsumogiri : "",
    review ? s.review : "",
    selected ? s.sel : "",
    flash ? s.flash : "",
    called ? s.called : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      data-called={called ? "" : undefined}
      aria-label={`${label} を編集`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      {back ? null : <OssTileFace code={code} />}
    </button>
  );
}

/** ドラ/裏ドラ表示用の小さな牌グリフ。
 *  未選択(null)は破線の空スロットを出す（何も描かないと「無い」ことすら見えない）。 */
export function DoraGlyph({ code }: { code: Tile | null }) {
  return (
    <span className={`${s.doraT} ${code ? "" : s.doraEmpty}`}>
      {code && <OssTileFace code={code} />}
    </span>
  );
}
