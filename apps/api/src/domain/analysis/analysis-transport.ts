// domain/analysis — 非同期解析の搬送ポート（docs/plans/async-analysis.md）。
// 画像の一時置き場（実体=R2）とジョブキュー（実体=Cloudflare Queues）。
// 一時画像は「解析ジョブの間だけ」の存在（[決定] 2026-08-01 ハードルール変更）。
// 牌譜ジョブは終端で deletePrefix。何切るジョブは結果（result.json）だけ残して
// 画像を消す（結果の受け渡しも R2。[決定] 2026-08-02 オーナー承認・保険は TTL 1日）。

import type { CameraSeat, Seat } from "@rigel/schema";
import type { ImageRef } from "../kifu/analyzer";

/** ジョブの一時オブジェクトのキー接頭辞（この下に river / hand_{cam} / result.json を置く）。 */
export function analysisJobPrefix(jobId: string): string {
  return `jobs/${jobId}/`;
}

/** 何切るジョブの結果ドラフト（Kifu JSON）の置き場。画像と同じ prefix 配下＝TTL 1日が効く。 */
export function analysisResultKey(jobId: string): string {
  return `${analysisJobPrefix(jobId)}result.json`;
}

/** キューへ送ったメッセージの控え（Phase 2「もう一度解析」の再 enqueue 用）。
 *  画像と同じ prefix 配下＝done の掃除・TTL 1日がそのまま効く。 */
export function analysisMessageKey(jobId: string): string {
  return `${analysisJobPrefix(jobId)}message.json`;
}

export interface AnalysisImageStore {
  put(key: string, image: ImageRef): Promise<void>;
  /** 無ければ null（ライフサイクル削除・キー誤りなど）。 */
  get(key: string): Promise<ImageRef | null>;
  /** 単一キーの削除（何切るジョブ: 画像だけ消して result.json を残すため）。 */
  delete(key: string): Promise<void>;
  /** ジョブの一時オブジェクトをまとめて削除（牌譜ジョブの終端で必ず呼ぶ）。 */
  deletePrefix(prefix: string): Promise<void>;
  /** JSON 値の置き場（何切るジョブの結果ドラフト用。画像と同じバケット）。 */
  putJson(key: string, value: unknown): Promise<void>;
  /** 無ければ null（TTL 削除済みなど）。 */
  getJson(key: string): Promise<unknown | null>;
}

/** 牌譜解析（半荘へ保存）のメッセージ。kind 省略は既存メッセージ（後方互換）。 */
export interface KifuAnalysisJobMessage {
  kind?: "kifu";
  jobId: string;
  userId: string;
  /** 保存先の半荘（半荘先行作成により常にある。plan 8-3）。 */
  gameId: string;
  cameraBottomSeat: Seat;
  riverKey: string;
  handKeys: Partial<Record<CameraSeat, string>>;
  /** 1枚モード（河写真から手前の手牌も読む。docs/plans/one-shot-hand.md）。 */
  handFromRiver?: boolean;
}

/** 何切るの写真AI再現（保存しない・結果は R2 の result.json）のメッセージ。 */
export interface ProblemAnalysisJobMessage {
  kind: "problem";
  jobId: string;
  userId: string;
  cameraBottomSeat: Seat;
  handKey: string;
  riverKey?: string;
}

/** キューに載せるメッセージ。画像本体は載せない（R2 のキーだけ）。 */
export type AnalysisJobMessage = KifuAnalysisJobMessage | ProblemAnalysisJobMessage;

export interface AnalysisQueue {
  send(message: AnalysisJobMessage): Promise<void>;
}
