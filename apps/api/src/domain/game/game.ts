// domain/game — Game（半荘）。複数局の牌譜(GameLog)をまとめる単位。

export interface Game {
  id: string;
  userId: string;
  /** 任意ラベル（例: "6/28 友人戦"）。 */
  title: string;
  createdAt: Date;
}
