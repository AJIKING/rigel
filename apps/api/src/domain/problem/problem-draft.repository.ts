// domain/problem — 何切るの解析下書き（[決定] 2026-08-03 photo-retention.md）。
// 写真AI再現の送信で先行作成され、解析完了で kifu が入る。閲覧・操作は所有者のみ。
// 正規保存（problems 行の作成）で畳まれ、写真（problems/{id}/…）は問題へ引き継がれる。

import type { Kifu } from "@rigel/schema";

export interface ProblemDraft {
  id: string;
  userId: string;
  /** 最新の解析ジョブ（状態導出用）。 */
  jobId: string;
  /** 解析結果のドラフト盤面。解析中・失敗は null。 */
  kifu: Kifu | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProblemDraftRepository {
  create(params: { id: string; userId: string; jobId: string; now: Date }): Promise<void>;
  /** 所有者の下書きだけ返す（他人・不存在は null）。 */
  findForUser(id: string, userId: string): Promise<ProblemDraft | null>;
  /** ジョブから下書きを引く（ポーリング応答用）。 */
  findByJobForUser(jobId: string, userId: string): Promise<ProblemDraft | null>;
  /** 所有者の下書き一覧（新しい順）。 */
  listByUser(userId: string): Promise<ProblemDraft[]>;
  /** 解析完了時に結果を格納する。 */
  setKifu(id: string, params: { kifu: Kifu; now: Date }): Promise<void>;
  /** 破棄・正規保存後の畳み込み。 */
  delete(id: string): Promise<void>;
}
