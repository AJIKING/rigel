// ナビゲーションのルート定義（型のみ）。screens と App が共有する。
export type RootStackParamList = {
  GamesList: undefined;
  GameDetail: { gameId: string };
  Board: { gameId: string; logId: string };
  Capture: undefined;
};
