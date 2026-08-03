// ============================================================
// application — 何切るの元写真（一覧・取得）
// ------------------------------------------------------------
// 撮影画像の恒久保存（[決定] 2026-08-03 photo-retention.md）。
// 写真は R2 の `problems/{photoDraftId}/{jobId}/{hand|river}` に置かれ、
// 解析下書き（編集前）と、正規保存後の問題（photoDraftId で引き継ぎ）の両方から引ける。
// 閲覧は所有者のみ（公開問題でも露出しない）。他人・不存在は null（ルートで 404）。
// ============================================================

import { problemDraftPrefix, type AnalysisImageStore } from "../domain/analysis/analysis-transport";
import type { ImageRef } from "../domain/kifu/analyzer";
import type { ProblemDraftRepository } from "../domain/problem/problem-draft.repository";
import type { ProblemRepository } from "../domain/problem/problem.repository";

/** 何切る写真の種類（R2 キーの末尾）。牌譜と違い hand（自分の手牌）＋ river（任意）。 */
export const PROBLEM_PHOTO_KINDS = ["hand", "river"] as const;
export type ProblemPhotoKind = (typeof PROBLEM_PHOTO_KINDS)[number];

export function isProblemPhotoKind(v: string): v is ProblemPhotoKind {
  return (PROBLEM_PHOTO_KINDS as readonly string[]).includes(v);
}

export interface ProblemPhoto {
  jobId: string;
  kind: ProblemPhotoKind;
}

/** 参照元: 正規保存済みの問題か、編集前の解析下書きか。 */
export type ProblemPhotoRef = { problemId: string } | { draftId: string };

export class ProblemPhotos {
  constructor(
    private readonly problems: ProblemRepository,
    private readonly drafts: ProblemDraftRepository,
    private readonly images: AnalysisImageStore,
  ) {}

  /** 所有者確認込みで写真プレフィックスを解決する（他人・不存在・写真なしは null）。 */
  private async prefixFor(userId: string, ref: ProblemPhotoRef): Promise<string | null> {
    if ("draftId" in ref) {
      const draft = await this.drafts.findForUser(ref.draftId, userId);
      return draft ? problemDraftPrefix(draft.id) : null;
    }
    const post = await this.problems.findById(ref.problemId);
    if (!post || post.userId !== userId || !post.photoDraftId) return null;
    return problemDraftPrefix(post.photoDraftId);
  }

  async list(userId: string, ref: ProblemPhotoRef): Promise<ProblemPhoto[] | null> {
    const prefix = await this.prefixFor(userId, ref);
    if (!prefix) return null;
    const keys = await this.images.listKeys(prefix);
    const photos: ProblemPhoto[] = [];
    for (const key of keys) {
      const [jobId, name, ...rest] = key.slice(prefix.length).split("/");
      if (!jobId || !name || rest.length > 0) continue;
      if (isProblemPhotoKind(name)) photos.push({ jobId, kind: name });
    }
    return photos;
  }

  async get(
    userId: string,
    ref: ProblemPhotoRef,
    jobId: string,
    kind: ProblemPhotoKind,
  ): Promise<ImageRef | null> {
    const prefix = await this.prefixFor(userId, ref);
    if (!prefix) return null;
    return this.images.get(`${prefix}${jobId}/${kind}`);
  }
}
