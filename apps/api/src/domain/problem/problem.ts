// ============================================================
// domain/problem — 何切る問題（1問 = D1 の 1 レコード / 共有URL単位）
// ------------------------------------------------------------
// 問題本体（盤面・答え・解説）は背骨スキーマ(@rigel/schema)の Problem を JSON で保持する。
// 状態は draft / published の二状態（公開非公開の概念なし。published は誰でも閲覧可）。
// ============================================================

import type { Problem } from "@rigel/schema";

export type ProblemStatus = "draft" | "published";

export interface ProblemPost {
  id: string;
  userId: string;
  /** 任意のタイトル（例: "南3局の押し引き"）。 */
  title: string;
  /** 問題本体（ProblemSchema 検証済み）。 */
  problem: Problem;
  status: ProblemStatus;
  createdAt: Date;
}
