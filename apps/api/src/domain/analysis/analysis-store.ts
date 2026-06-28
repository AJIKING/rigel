// domain/analysis — 解析結果の原子的コミット用ポート。
// 「半荘(新規なら)・局・課金カウント」を **1トランザクション** で保存する。
// 個別リポジトリの save を別々に呼ぶと途中失敗や競合で不整合になるため、ここで束ねる。
// 実体は infrastructure（D1 の batch）。

import type { Game } from "../game/game";
import type { GameLog } from "../kifu/game-log";
import type { User } from "../user/user";

export interface AnalysisCommitInput {
  /** 新規半荘（既存に追加する場合は null）。 */
  newGame: Game | null;
  /** 保存する局。 */
  gameLog: GameLog;
  /** カウント加算後のユーザー（永続化する状態）。 */
  user: User;
}

export interface AnalysisStore {
  /** newGame・gameLog・user を1トランザクションでまとめて保存する。 */
  commit(input: AnalysisCommitInput): Promise<void>;
}
