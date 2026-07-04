// ナビゲーションのルート定義（型のみ）。screens と App が共有する。
export type RootStackParamList = {
  Home: undefined;
  GameDetail: { gameId: string };
  Board: { gameId: string; logId: string };
  Edit: { gameId: string; logId: string };
  PublicGame: { gameId: string; logId?: string };
  Capture: undefined;
};
