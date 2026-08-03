"use client";

import { type ProblemPhotoMeta, type ProblemPhotoRef } from "@rigel/client";
import { problemPhotoLabel, PHOTOS_OWNER_ONLY_NOTE } from "@rigel/ui";
import { useEffect, useState } from "react";
import { getProblemPhotosAction } from "../../app/actions";
import s from "../board/board-editor.module.css";

/**
 * 何切るの元写真ビュー（恒久保存・所有者のみ。photo-retention.md）。
 * AI の読み取りを元写真と突き合わせて確認できる。バイトは BFF プロキシ
 * （/api/problem-photos/…・Cookie 認証）経由なので <img> でそのまま表示できる。
 */
export function ProblemPhotosModal({
  refValue,
  onClose,
}: {
  /** 正規保存済みの問題（problemId）か、編集前の解析下書き（draftId）。 */
  refValue: ProblemPhotoRef;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<ProblemPhotoMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const refKey = "problemId" in refValue ? refValue.problemId : refValue.draftId;
  const refType = "problemId" in refValue ? "problem" : "draft";

  useEffect(() => {
    let alive = true;
    const ref: ProblemPhotoRef =
      refType === "problem" ? { problemId: refKey } : { draftId: refKey };
    getProblemPhotosAction(ref)
      .then((p) => {
        if (alive) setPhotos(p ?? []);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [refKey, refType]);

  // Escape で閉じる（GamePhotosModal と同じ操作感）。
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
            <p className={s.note}>この問題に元写真はありません。</p>
          ) : (
            <div className={s.photoList}>
              {photos.map((p) => (
                <figure key={`${p.jobId}/${p.kind}`} className={s.photoItem}>
                  {/* BFF プロキシの動的画像（Cookie 認証・本人専用）。next/image の最適化に載せない。 */}
                  <img
                    src={`/api/problem-photos/${refType}/${refKey}/${p.jobId}/${p.kind}`}
                    alt={problemPhotoLabel(p.kind)}
                  />
                  <figcaption>{problemPhotoLabel(p.kind)}</figcaption>
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
