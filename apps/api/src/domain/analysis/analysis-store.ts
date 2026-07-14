// domain/analysis — 解析結果の原子的コミット用ポート。
// 「半荘(新規なら)・局・課金カウント」を **1トランザクション** で保存する。
// 個別リポジトリの save を別々に呼ぶと途中失敗や競合で不整合になるため、ここで束ねる。
// 実体は infrastructure（D1 の batch）。

import type { Game } from "../game/game";
import type { GameLog } from "../kifu/game-log";

/**
 * 課金カウンタの「差分」。ユーザーの最終状態（絶対値）を書き戻すと、並行する解析が
 * 同じ値を読んで互いを上書きし、消費を取りこぼす（＝枠を超えて Gemini を呼べる＝
 * コストが出る方向の lost update）。永続化は必ず差分の原子適用として表現する。
 */
export interface AnalysisCounterDelta {
  userId: string;
  /** 加算する Gemini 呼び出し回数（解析成功時のみ）。 */
  calls: number;
  /** 現在時刻（月境界の判定に使う）。 */
  now: Date;
  /** 月境界を跨いでいた場合の新しいリセット時刻（判定ロジックはドメインが持つ）。 */
  nextResetAt: Date;
}

export interface AnalysisCommitInput {
  /** 新規半荘（既存に追加する場合は null）。 */
  newGame: Game | null;
  /** 保存する局。 */
  gameLog: GameLog;
  /** 課金カウンタの加算（成功時のみ・実呼び出し数）。 */
  counter: AnalysisCounterDelta;
}

export interface AnalysisStore {
  /** newGame・gameLog・カウンタ加算を1トランザクションでまとめて保存する。 */
  commit(input: AnalysisCommitInput): Promise<void>;
  /** カウンタ加算だけを原子適用する（行は増やさない）。
   *  何切るの写真解析のように「解析するが保存しない」経路の課金に使う。 */
  recordCalls(counter: AnalysisCounterDelta): Promise<void>;
}
