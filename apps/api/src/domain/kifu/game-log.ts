// domain/kifu — GameLog エンティティ（1局の牌譜スナップショット）。
// 中身の Kifu は背骨スキーマ(@rigel/schema)の値オブジェクト。撮影画像は保持しない。

import type { Kifu } from "@rigel/schema";

/** 公開範囲。public=他ユーザーも閲覧可 / private=所有者のみ。 */
export type Visibility = "public" | "private";

/** 編集状態。draft=下書き（作成直後・要修正）/ complete=編集済（公開フィードに出る）。 */
export type KifuStatus = "draft" | "complete";

export interface GameLog {
  /** 牌譜ID（= 共有URL単位 / 課金単位）。 */
  id: string;
  /** 所有ユーザー。 */
  userId: string;
  /** 所属する半荘（未所属は null）。 */
  gameId: string | null;
  /** 半荘内の表示順。 */
  seq: number;
  /** 解析後の牌譜（KifuSchema 検証済み）。撮影画像は含めない。 */
  kifu: Kifu;
  /** 公開範囲（既定 private）。 */
  visibility: Visibility;
  /** 編集状態（既定 draft。公開フィードは complete のみ）。 */
  status: KifuStatus;
  createdAt: Date;
}

/**
 * 局が viewer に見えるか。所有者は常に見える。他人には **public かつ complete** のみ
 * （[決定] 2026-08-03 オーナー。公開フィード・公開ビューア・お気に入りの canView と同じ規律に
 * 揃えた。公開範囲は半荘単位で新局が public を引き継ぐため、status を見ないと追加解析の直後に
 * 「目検前の AI ドラフト局」が他人へ露出する）。
 * 未ログインは viewerId=null。判定はここに集約し、HTTP ルートで再実装しない。
 */
export function isVisibleTo(
  log: Pick<GameLog, "userId" | "visibility" | "status">,
  viewerId: string | null,
): boolean {
  if (log.userId === viewerId) return true;
  return log.visibility === "public" && log.status === "complete";
}

/** 公開フィード用の局の要約（Kifu 本体を含まない読み取りモデル）。
 *  一覧のコストを「保存された牌譜のサイズ」から切り離すために使う。 */
export interface GameLogSummary {
  id: string;
  gameId: string | null;
  userId: string;
  createdAt: Date;
}
