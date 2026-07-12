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

/** 公開フィード用の局の要約（Kifu 本体を含まない読み取りモデル）。
 *  一覧のコストを「保存された牌譜のサイズ」から切り離すために使う。 */
export interface GameLogSummary {
  id: string;
  gameId: string | null;
  userId: string;
  createdAt: Date;
}
