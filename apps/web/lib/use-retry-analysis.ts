"use client";

// 「もう一度解析」の共通フロー（busy ガード → retryAnalysisAction → Provider に追わせる）。
// MyKifuScreen / GameHeaderScreen / BoardEditor に同形の実装が3つ育っていたのを一本化
// （品質パス 2026-08-03）。成功後の画面反映（楽観更新・バナー切替）は呼び出し側の責務。

import { analyzeErrorMessage, ANALYSIS_BUSY_MESSAGE } from "@rigel/ui";
import { useCallback } from "react";
import { retryAnalysisAction } from "../app/actions";
import { useAnalysisJob } from "./use-analysis-job";

export type RetryAnalysisOutcome = { ok: true } | { ok: false; message: string };

export function useRetryAnalysis(): (jobId: string) => Promise<RetryAnalysisOutcome> {
  const { busy, start } = useAnalysisJob();
  return useCallback(
    async (jobId: string): Promise<RetryAnalysisOutcome> => {
      // 解析はひとつずつ（202 の後に断るとサーバー側で課金・キュー投入が済んでいるため送信前に見る）。
      if (busy) return { ok: false, message: ANALYSIS_BUSY_MESSAGE };
      try {
        const r = await retryAnalysisAction(jobId);
        if (!r.ok) return { ok: false, message: analyzeErrorMessage(r.status, r.reason) };
        start({ jobId: r.jobId, startedAt: Date.now() });
        return { ok: true };
      } catch {
        return { ok: false, message: "通信に失敗しました。" };
      }
    },
    [busy, start],
  );
}
