// domain/analysis — 解析ジョブ（非同期化のジョブ状態。docs/plans/async-analysis.md）。
// POST /analyze は 202 + jobId を即返し、解析本体はキュー consumer（RunAnalysisJob）が実行、
// 完了/失敗をここに書く。画像・牌譜本体は持たない（結果は games/game_logs への参照だけ）。

export type AnalysisJobStatus = "processing" | "done" | "failed";

export interface AnalysisJob {
  id: string;
  userId: string;
  status: AnalysisJobStatus;
  /** 完了時のみ（done で必ず入る）。 */
  gameId: string | null;
  logId: string | null;
  /** 失敗時の分類（クライアント表示用の固定語彙想定。詳細ログはサーバー側）。 */
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AnalysisJobRepository {
  /** processing 状態でジョブを作る（半荘先行作成: gameId は最初から紐づく。plan 8-3）。 */
  create(params: { id: string; userId: string; gameId: string; now: Date }): Promise<void>;
  /** 所有者のジョブだけ返す（他人・不存在は null）。 */
  findForUser(id: string, userId: string): Promise<AnalysisJob | null>;
  /** 所有者の未終了ジョブ（processing/failed）一覧。done は返さない
   *  （一覧 DTO の analysisStatus 導出と再解析ガードに要るのはこの2状態だけ。
   *  完了履歴が溜まっても毎回舐めない）。 */
  listActiveByUser(userId: string): Promise<AnalysisJob[]>;
  markDone(id: string, params: { gameId: string; logId: string; now: Date }): Promise<void>;
  markFailed(id: string, params: { reason: string; now: Date }): Promise<void>;
  /** 半荘削除時の掃除。processing の行も消す＝キャンセル扱い
   *  （consumer は行が無ければ何もしないので、進行中でも安全に消せる）。 */
  deleteByGame(gameId: string): Promise<void>;
}
