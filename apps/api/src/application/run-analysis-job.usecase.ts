// ============================================================
// application — RunAnalysisJob ユースケース（キュー consumer 側）
// ------------------------------------------------------------
// 解析の非同期ジョブ化（docs/plans/async-analysis.md）。メッセージから一時画像（R2）を
// 取り、既存パイプライン（AnalyzeAndSaveKifu.execute）を実行してジョブ状態へ写す。
//   - 終端（done / failed）では一時画像を必ず削除（保険はバケットのライフサイクル1日）
//   - 課金は execute 内の「成功時のみ加算」がそのまま効く
//   - 一過性の例外は attempts が尽きるまで throw（Queues の再送に任せる）。
//     尽きたら failed(analysis_failed) に落として ack（無限再送にしない）
//   - processing 以外のジョブは何もしない（遅延再送・並行再送との競合で二重実行しない）
// ============================================================

import type { CameraSeat } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  analysisJobPrefix,
  type AnalysisImageStore,
  type AnalysisJobMessage,
} from "../domain/analysis/analysis-transport";
import type { ImageRef } from "../domain/kifu/analyzer";
import type { AnalyzeParams, AnalyzeResult } from "./analyze-and-save-kifu.usecase";

/** wrangler.toml の max_retries=2 と対応（初回 + 再送2回 = 最大3回試行）。 */
export const MAX_ANALYSIS_ATTEMPTS = 3;

export interface RunAnalysisJobDeps {
  jobs: AnalysisJobRepository;
  images: AnalysisImageStore;
  /** 解析本体（枠チェック・原子的保存・成功時のみ課金を含む既存ユースケース）。 */
  analyze: { execute(params: AnalyzeParams): Promise<AnalyzeResult> };
  now: () => Date;
}

export class RunAnalysisJob {
  constructor(private readonly deps: RunAnalysisJobDeps) {}

  async execute(message: AnalysisJobMessage, attempts: number): Promise<void> {
    const { jobs, images, analyze, now } = this.deps;

    const job = await jobs.findForUser(message.jobId, message.userId);
    if (!job || job.status !== "processing") return;

    const prefix = analysisJobPrefix(message.jobId);
    try {
      const riverImage = await images.get(message.riverKey);
      if (!riverImage) {
        await jobs.markFailed(message.jobId, { reason: "images_missing", now: now() });
        await images.deletePrefix(prefix);
        return;
      }
      const hands: Partial<Record<CameraSeat, ImageRef>> = {};
      for (const [cam, key] of Object.entries(message.handKeys) as [CameraSeat, string][]) {
        const image = await images.get(key);
        if (image) hands[cam] = image;
      }

      const result = await analyze.execute({
        userId: message.userId,
        input: {
          riverImage,
          hands,
          cameraBottomSeat: message.cameraBottomSeat,
          ...(message.handFromRiver ? { handFromRiver: true } : {}),
        },
        ...(message.gameId ? { gameId: message.gameId } : {}),
      });

      // 終端書き込みは再送に乗せない: execute は成功済み（保存・課金加算済み）なので、
      // ここで例外を投げ返すと再送がガード（status=processing）を素通りして解析ごと
      // やり直し＝二重保存・二重課金になる。書けなければ processing のまま残す
      // （クライアントはタイムアウト表示。課金整合 > 完了通知の即時性）。
      try {
        if (result.ok) {
          await jobs.markDone(message.jobId, {
            gameId: result.gameId,
            logId: result.gameLog.id,
            now: now(),
          });
        } else {
          await jobs.markFailed(message.jobId, { reason: result.reason, now: now() });
        }
        await images.deletePrefix(prefix);
      } catch (e) {
        console.error("analysis job terminal write failed", message.jobId, e);
      }
    } catch (e) {
      if (attempts < MAX_ANALYSIS_ATTEMPTS) throw e; // Queues が再送（画像は残す）
      console.error("analysis job failed permanently", message.jobId, e);
      await jobs
        .markFailed(message.jobId, { reason: "analysis_failed", now: now() })
        .catch(() => {});
      await images.deletePrefix(prefix).catch(() => {});
    }
  }
}
