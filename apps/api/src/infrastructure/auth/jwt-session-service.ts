// infrastructure/auth — SessionService の実体（jose / HS256）。
// userId を sub に載せて署名し、検証して取り出す。Web Crypto ベースで Workers で動く。

import { SignJWT, jwtVerify } from "jose";
import type { SessionService } from "../../domain/auth/session";

const ALG = "HS256";

export interface JwtSessionConfig {
  /** 署名鍵（env の SESSION_SECRET）。 */
  secret: string;
  /** 有効期限（既定 30日）。 */
  expiresIn?: string;
}

export class JwtSessionService implements SessionService {
  private readonly key: Uint8Array;
  private readonly expiresIn: string;

  constructor(config: JwtSessionConfig) {
    this.key = new TextEncoder().encode(config.secret);
    this.expiresIn = config.expiresIn ?? "30d";
  }

  async issue(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: ALG })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(this.expiresIn)
      .sign(this.key);
  }

  async verify(token: string): Promise<{ userId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key);
      return payload.sub ? { userId: payload.sub } : null;
    } catch {
      return null;
    }
  }
}
