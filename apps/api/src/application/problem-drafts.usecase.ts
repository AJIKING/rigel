// ============================================================
// application — 何切るの解析下書き（一覧・取得・破棄）
// ------------------------------------------------------------
// [決定] 2026-08-03 photo-retention.md。写真AI再現の送信で先行作成された下書きを
// マイページに出し、開けば編集へ流し込み、破棄すれば写真ごと消す。
// 状態はジョブから導出: kifu あり=ready / processing（30分超は failed 表示）/ failed。
// ============================================================

import type { Kifu } from "@rigel/schema";
import type { AnalysisJobRepository } from "../domain/analysis/analysis-job";
import {
  problemDraftPrefix,
  type AnalysisImageStore,
} from "../domain/analysis/analysis-transport";
import type { ProblemDraftRepository } from "../domain/problem/problem-draft.repository";
import { STALE_ANALYSIS_MS } from "./analysis-status";

export type ProblemDraftStatus = "processing" | "failed" | "ready";

export interface ProblemDraftCard {
  id: string;
  status: ProblemDraftStatus;
  createdAt: string;
}

export interface ProblemDraftView extends ProblemDraftCard {
  /** ready のときだけ入る解析結果（KifuSchema 検証済み）。 */
  draft: Kifu | null;
}

function deriveStatus(
  kifu: Kifu | null,
  job: { status: string; createdAt: Date } | null,
  now: Date,
): ProblemDraftStatus {
  if (kifu) return "ready";
  if (job?.status === "processing") {
    const stale = now.getTime() - job.createdAt.getTime() > STALE_ANALYSIS_MS;
    return stale ? "failed" : "processing";
  }
  return "failed"; // failed / ジョブ行が無い（掃除済み等）は失敗扱い
}

export class ListProblemDrafts {
  constructor(
    private readonly drafts: ProblemDraftRepository,
    private readonly jobs: AnalysisJobRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(userId: string): Promise<ProblemDraftCard[]> {
    const drafts = await this.drafts.listByUser(userId);
    const cards: ProblemDraftCard[] = [];
    for (const d of drafts) {
      const job = d.kifu ? null : await this.jobs.findForUser(d.jobId, userId);
      cards.push({
        id: d.id,
        status: deriveStatus(d.kifu, job, this.now()),
        createdAt: d.createdAt.toISOString(),
      });
    }
    return cards;
  }
}

export class GetProblemDraft {
  constructor(
    private readonly drafts: ProblemDraftRepository,
    private readonly jobs: AnalysisJobRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** 所有者の下書きだけ返す（他人・不存在は null = 404）。 */
  async execute(id: string, userId: string): Promise<ProblemDraftView | null> {
    const d = await this.drafts.findForUser(id, userId);
    if (!d) return null;
    const job = d.kifu ? null : await this.jobs.findForUser(d.jobId, userId);
    return {
      id: d.id,
      status: deriveStatus(d.kifu, job, this.now()),
      createdAt: d.createdAt.toISOString(),
      draft: d.kifu,
    };
  }
}

export type DeleteProblemDraftResult = { ok: true } | { ok: false; reason: "not_found" };

export class DeleteProblemDraft {
  constructor(
    private readonly drafts: ProblemDraftRepository,
    private readonly images: AnalysisImageStore,
  ) {}

  async execute(params: { userId: string; draftId: string }): Promise<DeleteProblemDraftResult> {
    const d = await this.drafts.findForUser(params.draftId, params.userId);
    if (!d) return { ok: false, reason: "not_found" };
    // 写真（R2）は D1 の行より先に消す（参照喪失の防止。削除はデータ削除時＝これ）。
    await this.images.deletePrefix(problemDraftPrefix(d.id));
    await this.drafts.delete(d.id);
    return { ok: true };
  }
}
