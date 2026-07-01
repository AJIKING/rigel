import "server-only";
import { cookies } from "next/headers";

// web オリジンの first-party セッション Cookie（BFF）。Workers api のセッショントークンを
// HttpOnly Cookie に保持し、サーバ（Server Component / Route Handler / Server Action）だけが
// 読める。クライアント JS からは触れない（XSS 対策）。同一オリジンなので SameSite=Lax で CSRF も緩和。
export const SESSION_COOKIE = "rigel_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30日（api の JWT 有効期限と同じ）。

/** Cookie からセッショントークンを取り出す（無ければ null）。 */
export async function getSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}

/** ログイン成立時にセッション Cookie を張る。 */
export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

/** ログアウト時に Cookie を破棄する（HttpOnly なのでクライアントからは消せない）。 */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
