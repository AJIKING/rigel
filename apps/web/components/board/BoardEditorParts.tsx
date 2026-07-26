"use client";

import type { Tile } from "@rigel/schema";
import type React from "react";
import { DoraGlyph } from "./tiles";
import s from "./board-editor.module.css";

// 盤面エディタの小さな表示部品。BoardEditor 本体（対話・保存の状態を持つ）から
// 切り出してある — ここは props だけで完結し、エディタの状態を一切知らない。

/** ゲート（認証確認中・未ログイン・エラー・データ取得中）用のダーク全画面シェル。
 *  盤面と同じ地色（themeBoard の .app）で、白画面フラッシュを出さない。 */
export function GateShell({ children }: { children?: React.ReactNode }) {
  return (
    <div
      className={`${s.app} themeBoard`}
      style={{ display: "grid", placeItems: "center", padding: 24 }}
    >
      {children}
    </div>
  );
}

/** 局情報のドラ/裏ドラ1行（複数枚）。牌クリックで変更、✕で削除、＋で追加（最大5枚）。 */
export function DoraNavRow({
  label,
  tiles,
  onOpen,
  onRemove,
}: {
  label: string;
  tiles: Tile[];
  /** index あり=その1枚の変更、無し=追加。 */
  onOpen: (e: React.MouseEvent, index?: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className={s.steprow}>
      <span className={s.stlabel}>{label}</span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {tiles.map((t, i) => (
          <span key={`${t}-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
            <button
              className={s.doraPick}
              aria-label={`${label}${i + 1}を変更`}
              onClick={(e) => onOpen(e, i)}
            >
              <DoraGlyph code={t} />
            </button>
            <button
              aria-label={`${label}${i + 1}を削除`}
              onClick={() => onRemove(i)}
              className={s.doraRemove}
            >
              ✕
            </button>
          </span>
        ))}
        {tiles.length < 5 && (
          <button
            className={s.doraPick}
            aria-label={`${label}を追加`}
            onClick={(e) => onOpen(e, undefined)}
          >
            <DoraGlyph code={null} />
            {/* 牌の破線スロットだけだと気づきにくいので、未選択時はラベルも出す。 */}
            {tiles.length === 0 && <span className={s.doraAddText}>＋ 選ぶ</span>}
          </button>
        )}
      </span>
    </div>
  );
}

/** ヘッダのセグメント切替（盤面/手順・下書き/編集済 で共用）。 */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className={s.statusSeg} role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button
          key={v}
          className={value === v ? s.on : ""}
          aria-pressed={value === v}
          onClick={(e) => {
            e.stopPropagation();
            onChange(v);
          }}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
