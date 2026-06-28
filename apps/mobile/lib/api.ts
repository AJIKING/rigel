// mobile → api（Workers）の薄いクライアント。API ベースURLは EXPO_PUBLIC_API_URL。

import type { Kifu } from "@rigel/schema";

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

export interface Game {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
}

export interface GameLog {
  id: string;
  userId: string;
  gameId: string | null;
  seq: number;
  kifu: Kifu;
  createdAt: string;
}

export interface GameDetail {
  game: Game;
  logs: GameLog[];
}

export async function getGames(token: string): Promise<Game[]> {
  const res = await fetch(`${API_BASE}/games`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`games failed: ${res.status}`);
  return res.json() as Promise<Game[]>;
}

export async function getGame(token: string, id: string): Promise<GameDetail | null> {
  const res = await fetch(`${API_BASE}/games/${id}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`game failed: ${res.status}`);
  return res.json() as Promise<GameDetail>;
}
