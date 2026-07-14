"use client";

import { type Kifu, type Seat } from "@rigel/schema";
import { analysisQuotaLabel, analyzeErrorMessage } from "@rigel/ui";
import { useState } from "react";
import { analyzeProblemAction } from "../../app/actions";
import { useAuth } from "../../lib/auth-context";
import { PhotoField } from "../board/PhotoField";
import s from "../board/board-editor.module.css";

/**
 * 何切るの「写真から作成」モーダル。自分の手牌（必須）＋河（任意）を解析に送り、
 * 盤面ドラフト（Kifu 形）を受け取って親（エディタ）へ返す。
 * 画像もドラフトも保存されない（Plan: docs/plans/problem-photo-analyze.md）。
 * 意匠は局追加モーダル（AddKyokuModal）の写真フォームと共通（board-editor.module.css）。
 */
export function ProblemPhotoModal({
  pov,
  onClose,
  onDone,
}: {
  /** 出題視点の席（= 撮影時の手前席として解析される）。 */
  pov: Seat;
  onClose: () => void;
  onDone: (kifu: Kifu) => void;
}) {
  const { user } = useAuth();
  const [hand, setHand] = useState<File | null>(null);
  const [river, setRiver] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 残枠は撮る前に見せる（送信後の枠切れで撮影の手間を無駄にしない。mobile Capture と同方針）。
  const quotaLabel = analysisQuotaLabel(user?.remainingCalls, user?.monthlyCallQuota);

  async function onAnalyze() {
    if (!hand) {
      setError("自分の手牌の写真を選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("hand", hand);
      if (river) form.set("river", river);
      form.set("cameraBottomSeat", pov);
      const result = await analyzeProblemAction(form);
      if (result.ok) {
        onDone(result.kifu);
        return;
      }
      setError(analyzeErrorMessage(result.status, result.reason));
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.modalOv} onClick={onClose}>
      <div
        className={s.modal}
        role="dialog"
        aria-label="写真から作成"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.modalHead}>
          <div className={s.modalTitle}>写真から作成</div>
          <button className={s.modalX} aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className={s.modalBody}>
          {quotaLabel && <p className={s.note}>{quotaLabel}</p>}
          <PhotoField label="自分の手牌（1枚・必須）" file={hand} onChange={setHand} />
          <PhotoField
            icon="plus"
            label="河（卓を上から1枚・任意）"
            file={river}
            onChange={setRiver}
          />
          <p className={s.note}>
            AIが手牌・河のベースを再現します。読み違いは編集で直してください（画像は保存されません）。
          </p>
          {error && (
            <p className={s.note} style={{ color: "var(--vermilion)" }}>
              {error}
            </p>
          )}
        </div>
        <div className={s.modalFoot}>
          <button className={s.btnGhost} onClick={onClose}>
            キャンセル
          </button>
          <button className={s.btnPrimary} disabled={busy} onClick={() => void onAnalyze()}>
            {busy && <span className={s.spinner} />}
            {busy ? "解析中…" : "AI再現"}
          </button>
        </div>
      </div>
    </div>
  );
}
