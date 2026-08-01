// domain/analysis — 非同期解析の搬送ポート（docs/plans/async-analysis.md）。
// 画像の一時置き場（実体=R2）とジョブキュー（実体=Cloudflare Queues）。
// 一時画像は「解析ジョブの間だけ」の存在（[決定] 2026-08-01 ハードルール変更）。
// 完了・失敗を問わず deletePrefix で必ず消す（保険はバケットのライフサイクル1日）。

import type { CameraSeat, Seat } from "@rigel/schema";
import type { ImageRef } from "../kifu/analyzer";

/** ジョブの一時画像のキー接頭辞（この下に river / hand_{cam} を置く）。 */
export function analysisJobPrefix(jobId: string): string {
  return `jobs/${jobId}/`;
}

export interface AnalysisImageStore {
  put(key: string, image: ImageRef): Promise<void>;
  /** 無ければ null（ライフサイクル削除・キー誤りなど）。 */
  get(key: string): Promise<ImageRef | null>;
  /** ジョブの一時画像をまとめて削除（成功・失敗とも必ず呼ぶ）。 */
  deletePrefix(prefix: string): Promise<void>;
}

/** キューに載せるメッセージ。画像本体は載せない（R2 のキーだけ）。 */
export interface AnalysisJobMessage {
  jobId: string;
  userId: string;
  /** 追加先の半荘（未指定なら新規作成）。 */
  gameId?: string;
  cameraBottomSeat: Seat;
  riverKey: string;
  handKeys: Partial<Record<CameraSeat, string>>;
}

export interface AnalysisQueue {
  send(message: AnalysisJobMessage): Promise<void>;
}
