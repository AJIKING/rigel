"use client";

import { type GamePhotoMeta } from "@rigel/client";
import { cameraLabel } from "@rigel/ui";
import { useEffect, useState } from "react";
import { getGamePhotosAction } from "../../app/actions";
import s from "./board-editor.module.css";

/** 写真ラベル（河=卓全景、手牌はカメラ相対位置）。 */
function photoLabel(p: GamePhotoMeta): string {
  if (p.kind === "river") return "卓全景（河）";
  return `手牌：${cameraLabel(p.kind.replace("hand_", "") as "bottom" | "right" | "top" | "left")}`;
}

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

  return (
    <div className={s.modalOv} onClick={onClose}>
      <div
        className={s.modal}
        role="dialog"
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
                  <img src={`/api/photos/${gameId}/${p.jobId}/${p.kind}`} alt={photoLabel(p)} />
                  <figcaption>{photoLabel(p)}</figcaption>
                </figure>
              ))}
            </div>
          )}
          <p className={s.note}>元写真はあなたにだけ表示されます（公開半荘でも公開されません）。</p>
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
