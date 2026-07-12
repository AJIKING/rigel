// infrastructure/kifu — GameLog ⇄ D1 行 のマッピング（単一真実源）。
//
// 局を書く実装は2つある（GameLogRepository.save と AnalysisStore.commit）。
// 行の組み立てを各所で手書きすると、カラム追加時に片方だけ漏れる
//（実際に status が analysis store 側で漏れ、下書きが公開フィードへ露出した）。
// 書き込み・読み出しはこの2関数だけを通す。

import { KifuSchema } from "@rigel/schema";
import type { GameLog } from "../../domain/kifu/game-log";
import type { GameLogRow, NewGameLogRow } from "../db/schema";

/** ドメイン → 行（insert/update に渡す値）。DB の既定値には一切頼らない。 */
export function toGameLogRow(log: GameLog): NewGameLogRow {
  return {
    id: log.id,
    userId: log.userId,
    gameId: log.gameId,
    seq: log.seq,
    kifu: log.kifu,
    visibility: log.visibility,
    status: log.status,
    createdAt: log.createdAt,
  };
}

/** 行 → ドメイン。保存済み牌譜はスキーマで正規化し、後から増えたフィールドに既定を埋める
 *  （旧データの後方互換）。 */
export function toGameLog(row: GameLogRow): GameLog {
  return {
    id: row.id,
    userId: row.userId,
    gameId: row.gameId,
    seq: row.seq,
    kifu: KifuSchema.parse(row.kifu),
    visibility: row.visibility,
    status: row.status,
    createdAt: row.createdAt,
  };
}
