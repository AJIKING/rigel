import type { Tile } from "@rigel/schema";
import { useState } from "react";
import { NUMS, SUITS, popAnchor, type Suit } from "../../lib/board";
import { OssTileFace } from "../OssTileFace";
import s from "./board-editor.module.css";

/** ドラ表示牌を選ぶボタン＋ポップアップ（牌種タブ＋牌グリッド）。
 *  ポップアップは position:fixed でビューポートに出す（モーダルの overflow:hidden に切られない）。
 *  value=null は未設定（空の牌面）。点数計算はしないので表示・記録のみ。 */
export function DoraPicker({ value, onPick }: { value: Tile | null; onPick: (t: Tile) => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [suit, setSuit] = useState<Suit>((value?.[1] as Suit) ?? "m");

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setPos((p) => (p ? null : popAnchor(e.currentTarget.getBoundingClientRect(), 236, 150)));
  }

  return (
    <>
      <button type="button" className={s.doraPick} aria-label="ドラを選ぶ" onClick={toggle}>
        <span className={s.doraT}>{value && <OssTileFace code={value} />}</span>
      </button>
      {pos && (
        <>
          {/* 外側クリックで閉じる透明レイヤ（モーダルは閉じない＝modal が stopPropagation 済み）。 */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200 }}
            onClick={(e) => {
              e.stopPropagation();
              setPos(null);
            }}
          />
          <div
            className={s.tilepop}
            style={{ left: pos.x, top: pos.y }}
            role="dialog"
            aria-label="ドラを選ぶ"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={s.tabs}>
              {SUITS.map((su) => (
                <button
                  key={su.suit}
                  type="button"
                  className={suit === su.suit ? s.on : ""}
                  onClick={() => setSuit(su.suit)}
                >
                  {su.label}
                </button>
              ))}
            </div>
            <div className={s.pgrid}>
              {NUMS[suit].map((code) => (
                <button
                  key={code}
                  type="button"
                  className={s.pk}
                  onClick={() => {
                    onPick(code);
                    setPos(null);
                  }}
                >
                  <span className={s.tile}>
                    <OssTileFace code={code} />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
