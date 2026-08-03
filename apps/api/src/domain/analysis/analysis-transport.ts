// domain/analysis — 非同期解析の搬送ポート（docs/plans/async-analysis.md）。
// 写真の置き場（実体=R2 バケット rigel・恒久）とジョブキュー（実体=Cloudflare Queues）。
// [決定] 2026-08-03 photo-retention.md: 画像は送信時から恒久保存し、
// 半荘（games/…）/ 解析下書き（problems/…）に紐づけ、データ削除時にだけ消す。

import type { CameraSeat, Seat } from "@rigel/schema";
import type { ImageRef } from "../kifu/analyzer";

/** 半荘に紐づく写真・控えの置き場（恒久。半荘削除で deletePrefix。photo-retention.md）。 */
export function gamePhotosPrefix(gameId: string): string {
  return `games/${gameId}/`;
}

/** 1回の解析ジョブぶんのオブジェクト（river / hand_{cam} / message.json）の置き場。 */
export function gameJobPrefix(gameId: string, jobId: string): string {
  return `${gamePhotosPrefix(gameId)}${jobId}/`;
}

/** 再解析用のメッセージ控え（牌譜ジョブ。半荘と同じ寿命）。 */
export function gameJobMessageKey(gameId: string, jobId: string): string {
  return `${gameJobPrefix(gameId, jobId)}message.json`;
}

/** 何切るの解析下書きに紐づく写真の置き場（恒久。下書き破棄/問題削除で deletePrefix）。 */
export function problemDraftPrefix(draftId: string): string {
  return `problems/${draftId}/`;
}

/** 1回の解析ジョブぶんの写真（hand / river）の置き場。 */
export function problemDraftJobPrefix(draftId: string, jobId: string): string {
  return `${problemDraftPrefix(draftId)}${jobId}/`;
}

export interface AnalysisImageStore {
  put(key: string, image: ImageRef): Promise<void>;
  /** 無ければ null（旧TTLバケット世代・キー誤りなど）。 */
  get(key: string): Promise<ImageRef | null>;
  /** 単一キーの削除。 */
  delete(key: string): Promise<void>;
  /** prefix 配下をまとめて削除（半荘削除・退会などデータ削除時の掃除）。 */
  deletePrefix(prefix: string): Promise<void>;
  /** prefix 配下のキー一覧（元写真の一覧表示用。件数は1半荘ぶんの想定）。 */
  listKeys(prefix: string): Promise<string[]>;
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

/** 何切るの写真AI再現のメッセージ。結果は解析下書き（problem_drafts）へ格納する。 */
export interface ProblemAnalysisJobMessage {
  kind: "problem";
  jobId: string;
  userId: string;
  /** 先行作成した解析下書き（photo-retention.md）。 */
  draftId: string;
  cameraBottomSeat: Seat;
  handKey: string;
  riverKey?: string;
}

/** キューに載せるメッセージ。画像本体は載せない（R2 のキーだけ）。 */
export type AnalysisJobMessage = KifuAnalysisJobMessage | ProblemAnalysisJobMessage;

export interface AnalysisQueue {
  send(message: AnalysisJobMessage): Promise<void>;
}
