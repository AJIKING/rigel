// ナビゲーションのルート定義（型のみ）。screens と App が共有する。
export type RootStackParamList = {
  Home: undefined;
  GameDetail: { gameId: string };
  Board: { gameId: string; logId: string };
  Edit: { gameId: string; logId: string };
  PublicGame: { gameId: string; logId?: string };
  /** gameId を渡すと既存半荘への局追加（写真解析/手入力を選ぶ画面を兼ねる）。 */
  Capture: { gameId?: string } | undefined;
  /** マイ何切る（自分の問題の管理）。何切るタブの右上から遷移。 */
  MyProblems: undefined;
  /** 何切る問題の回答画面。 */
  ProblemAnswer: { problemId: string };
  /** 何切る問題の作成（problemId なし）/ 編集（あり）。 */
  ProblemEdit: { problemId?: string } | undefined;
};
