"use client";

// 0局の半荘ヘッダビュー（/kifu/[gameId]。docs/plans/web-mobile-parity.md Phase C）。
// web には半荘詳細画面が無く、局が無い半荘（解析中・解析失敗）が開けなかった。
// エディタ本体は読み込まず、半荘メタの編集と解析ステータスだけを出す
// （mobile GameDetailScreen の 0局表示と同じ構成・文言）。

import { analyzeErrorMessage, deleteConfirmText, DELETE_CONFIRM } from "@rigel/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteGameAction,
  getGameAction,
  retryAnalysisAction,
  updateGameAction,
} from "../../app/actions";
import { type GameDetail } from "../../lib/api";
import { useAnalysisJob } from "../../lib/use-analysis-job";
import { AppHeader } from "../AppHeader";
import { AddKyokuModal } from "./AddKyokuModal";
import { GamePhotosModal } from "./GamePhotosModal";
import s from "./game-header.module.css";

export function GameHeaderScreen({ gameId, initial }: { gameId: string; initial: GameDetail }) {
  const router = useRouter();
  const [detail, setDetail] = useState(initial);
  const [title, setTitle] = useState(initial.game.title || "");
  const [dateInput, setDateInput] = useState(
    new Date(initial.game.createdAt).toISOString().slice(0, 10),
  );
  const [note, setNote] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);

  // 局ができたらエディタへ（解析完了・局追加のどちらでも。replace=戻るでここに残さない）。
  const firstLog = detail.logs[0];
  useEffect(() => {
    if (firstLog) router.replace(`/kifu/${gameId}/${firstLog.id}`);
  }, [firstLog, gameId, router]);

  // 解析追従（Phase B の Provider）: 終端で即 refetch。解析中バッジの間は 5 秒ポーリング
  //（他端末開始・復元漏れの進行も拾う。MyKifuScreen と同じ規律）。
  const { settledCount, busy: analysisBusy, start: startTracking } = useAnalysisJob();
  const refetch = useCallback(async () => {
    const d = await getGameAction(gameId).catch(() => null);
    if (d) setDetail(d);
  }, [gameId]);
  const settledSeen = useRef(settledCount);
  useEffect(() => {
    if (settledCount === settledSeen.current) return;
    settledSeen.current = settledCount;
    void refetch();
  }, [settledCount, refetch]);
  const processing = detail.analysisStatus === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void refetch(), 5000);
    return () => clearInterval(timer);
  }, [processing, refetch]);

  /** 半荘名の保存（blur。BoardEditor と同じ規律=未変更なら何もしない）。 */
  async function saveTitle() {
    const next = title.trim();
    if (next === (detail.game.title || "")) return;
    const res = await updateGameAction(gameId, { title: next }).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) setNote("半荘名の保存に失敗しました。");
    else setDetail((d) => ({ ...d, game: { ...d.game, title: next } }));
  }

  /** 対局日の保存（blur。YYYY-MM-DD。BoardEditor と同じ検証・API）。 */
  async function saveDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
      setNote("日付は YYYY-MM-DD 形式で入力してください。");
      return;
    }
    if (dateInput === new Date(detail.game.createdAt).toISOString().slice(0, 10)) return;
    const res = await updateGameAction(gameId, { createdAt: dateInput }).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (!res.ok) setNote("対局日の保存に失敗しました。");
  }

  /** もう一度解析（Phase 2）。202 後は Provider に追わせる（完了で refetch → エディタへ）。 */
  async function onRetry() {
    if (!detail.analysisJobId || retrying) return;
    if (analysisBusy) {
      setNote("解析はひとつずつ実行できます。進行中の解析が終わってからお試しください。");
      return;
    }
    setNote(null);
    setRetrying(true);
    try {
      const r = await retryAnalysisAction(detail.analysisJobId);
      if (r.ok) {
        startTracking({ jobId: r.jobId, startedAt: Date.now() });
        setDetail((d) => ({ ...d, analysisStatus: "processing" }));
      } else {
        setNote(analyzeErrorMessage(r.status, r.reason));
      }
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setRetrying(false);
    }
  }

  /** 半荘の削除（確認あり。文言は web/mobile 共通の DELETE_CONFIRM）。 */
  async function onDeleteGame() {
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.game(detail.game.title)))) return;
    const res = await deleteGameAction(gameId).catch(() => ({ ok: false }));
    if (res.ok) router.push("/mypage");
    else setNote("半荘の削除に失敗しました。");
  }

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section className={s.card}>
          <label className={s.field}>
            <span>半荘名</span>
            <input
              value={title}
              placeholder="（無題の半荘）"
              aria-label="半荘名"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle()}
            />
          </label>
          <label className={s.field}>
            <span>対局日</span>
            <input
              value={dateInput}
              placeholder="YYYY-MM-DD"
              aria-label="対局日"
              maxLength={10}
              onChange={(e) => setDateInput(e.target.value)}
              onBlur={() => void saveDate()}
            />
          </label>

          {/* 解析ジョブの状態（0局のうちはここが半荘の"中身"。mobile と同一文言）。 */}
          {detail.analysisStatus === "processing" && (
            <p className={s.analyzing} aria-live="polite">
              AI解析中です。完了すると局が追加されます。
            </p>
          )}
          {detail.analysisStatus === "failed" && (
            <div className={s.failedRow}>
              <span className={s.failedText}>解析に失敗しました。</span>
              {/* 再実行は再アップロード不要（画像は恒久保存）。期限切れ等は局追加からやり直す。 */}
              {detail.analysisJobId && (
                <button type="button" disabled={retrying} onClick={() => void onRetry()}>
                  {retrying ? "送信中…" : "もう一度解析"}
                </button>
              )}
            </div>
          )}
          {note && <p className={s.note}>{note}</p>}

          <div className={s.actions}>
            <button type="button" className={s.addBtn} onClick={() => setAddOpen(true)}>
              ＋ 局を追加
            </button>
            {/* 元写真（恒久保存・所有者のみ。photo-retention.md）。 */}
            <button type="button" onClick={() => setPhotosOpen(true)}>
              元写真
            </button>
            <button type="button" className={s.danger} onClick={() => void onDeleteGame()}>
              半荘を削除
            </button>
          </div>
          {/* ルール・選手情報は局（kifu）に載る＝0局のうちは設定できない（mobile と同じ）。 */}
          <p className={s.hint}>ルール・選手情報は、局が作成されると盤面から設定できます。</p>
        </section>
      </main>

      {addOpen && (
        <AddKyokuModal
          gameId={gameId}
          askSeat
          onClose={() => setAddOpen(false)}
          onDone={(logId) => router.push(`/kifu/${gameId}/${logId}`)}
        />
      )}
      {photosOpen && <GamePhotosModal gameId={gameId} onClose={() => setPhotosOpen(false)} />}
    </div>
  );
}
