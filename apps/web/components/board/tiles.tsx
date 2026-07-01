"use client";

import { type Tile } from "@rigel/schema";
import { OssTileFace } from "../OssTileFace";
import s from "./board-editor.module.css";

/** 盤面上の1牌ボタン（河/手牌/鳴き共通）。状態はクラスの付け外しで表現する。 */
export function BoardTile({
  code,
  kind,
  lay,
  tsumogiri,
  review,
  selected,
  flash,
  label,
  onClick,
}: {
  code: Tile | null;
  kind?: "river" | "meld";
  lay?: boolean;
  tsumogiri?: boolean;
  review?: boolean;
  selected?: boolean;
  flash?: boolean;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const cls = [
    s.tile,
    kind === "river" ? s.riverT : "",
    kind === "meld" ? s.meldT : "",
    lay ? s.lay : "",
    tsumogiri ? s.tsumogiri : "",
    review ? s.review : "",
    selected ? s.sel : "",
    flash ? s.flash : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      aria-label={`${label} を編集`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <OssTileFace code={code} />
    </button>
  );
}

/** ドラ/裏ドラ表示用の小さな牌グリフ（未設定なら空）。 */
export function DoraGlyph({ code }: { code: Tile | null }) {
  return <span className={s.doraT}>{code && <OssTileFace code={code} />}</span>;
}
