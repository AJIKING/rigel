"use client";

import { type GamePhotoMeta } from "@rigel/client";
import { gamePhotoLabel, PHOTOS_OWNER_ONLY_NOTE } from "@rigel/ui";
import { useEffect, useState } from "react";
import { getGamePhotosAction } from "../../app/actions";
import s from "./board-editor.module.css";

/**
 * 半荘の元写真ビュー（恒久保存・所有者のみ。photo-retention.md）。
 * AI の読み取りを元写真と突き合わせて確認できる。バイトは BFF プロキシ
 * （/api/photos/…・Cookie 認証）経由なので <img> でそのまま表示できる。
 */
export function GamePhotosModal({ gameId, onClose }: { gameId: string; onClose: () => void }) {
  const [photos, setPhotos] = useState<GamePhotoMeta[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getGamePhotosAction(gameId)
      .then((p) => {
        if (alive) setPhotos(p ?? []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  // Escape で閉じる（RulesDialog 等の既存モーダルと同じ操作感）。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={s.modalOv} onClick={onClose}>
      <div
        className={`${s.modal} ${s.modalScroll}`}
        role="dialog"
        aria-modal="true"
        aria-label="元写真"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.modalHead}>
          <div className={s.modalTitle}>元写真</div>
          <button className={s.modalX} aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={s.modalBody}>
          {failed ? (
            <p className={s.note}>写真を読み込めませんでした。</p>
          ) : photos === null ? (
            <p className={s.note}>読み込み中…</p>
          ) : photos.length === 0 ? (
            <p className={s.note}>
              この半荘に元写真はありません（写真AI再現で作成した半荘に残ります）。
            </p>
          ) : (
            <div className={s.photoList}>
              {photos.map((p) => (
                <figure key={`${p.jobId}/${p.kind}`} className={s.photoItem}>
                  {/* BFF プロキシの動的画像（Cookie 認証・本人専用）。next/image の最適化に載せない。 */}
                  <img
                    src={`/api/photos/${gameId}/${p.jobId}/${p.kind}`}
                    alt={gamePhotoLabel(p.kind)}
                  />
                  <figcaption>{gamePhotoLabel(p.kind)}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className={s.note}>{PHOTOS_OWNER_ONLY_NOTE}</p>
        </div>
        <div className={s.modalFoot}>
          <button className={s.btnGhost} onClick={onClose}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
