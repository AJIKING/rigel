// domain/kifu — GameLog エンティティ（1局の牌譜スナップショット）。
// 中身の Kifu は背骨スキーマ(@rigel/schema)の値オブジェクト。撮影画像は保持しない。

import type { Kifu } from "@rigel/schema";

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
  createdAt: Date;
}
