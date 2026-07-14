"use client";

import s from "./board-editor.module.css";

/**
 * 写真アップロード欄（アイコン＋ラベル/ファイル名）。
 * 局追加モーダル（AddKyokuModal）と何切るの写真モーダル（ProblemPhotoModal）で共用する。
 */
export function PhotoField({
  label,
  file,
  selectedLabel,
  icon = "camera",
  wide = false,
  onChange,
}: {
  /** 未選択時に見せる文言（例「河（卓を上から1枚）」）。 */
  label: string;
  file: File | null;
  /** 選択済みの表示（省略時はファイル名）。 */
  selectedLabel?: string;
  /** camera=主要枠 / plus=任意の追加枠。 */
  icon?: "camera" | "plus";
  /** 横長の主要枠（局追加の河用）。 */
  wide?: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={`${s.up} ${wide ? s.upRiver : ""} ${file ? s.filled : ""}`}>
      <input type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      <div className={s.upIn}>
        {icon === "camera" ? (
          <svg viewBox="0 0 24 24">
            <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="13" r="3.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        )}
        <span>{file ? (selectedLabel ?? file.name) : label}</span>
      </div>
    </label>
  );
}
