// web → api（Workers）の薄いクライアント。
// API のベースURLは NEXT_PUBLIC_API_URL（未設定なら同一オリジン）。

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface AuthUser {
  id: string;
  plan: "free" | "paid";
}

/** Google ID トークンでログインし、セッショントークンとユーザーを得る。 */
export async function authWithGoogle(
  idToken: string,
): Promise<{ sessionToken: string; user: AuthUser }> {
  const res = await fetch(`${API_BASE}/auth/google`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  return res.json() as Promise<{ sessionToken: string; user: AuthUser }>;
}

/** セッショントークンで自分のユーザー情報を取得。無効なら null。 */
export async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
}
