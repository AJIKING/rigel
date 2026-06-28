// domain/auth — セッションのポート。userId を載せた署名トークンの発行/検証。
// 実体(jose HS256)は infrastructure 層。

export interface SessionService {
  /** userId を載せたセッショントークンを発行する。 */
  issue(userId: string): Promise<string>;
  /** トークンを検証し userId を返す。無効なら null。 */
  verify(token: string): Promise<{ userId: string } | null>;
}
