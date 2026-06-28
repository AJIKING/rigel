// mobile → api（Workers）の薄いクライアント。API ベースURLは EXPO_PUBLIC_API_URL。

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

export interface AuthUser {
  id: string;
  plan: "free" | "paid";
}

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

export async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<AuthUser>;
}
