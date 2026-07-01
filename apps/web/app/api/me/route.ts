import { NextResponse } from "next/server";
import { fetchMe } from "../../../lib/api-server";
import { getSessionToken } from "../../../lib/session";

// 現在のユーザーを返す（Cookie セッションから復元）。auth-context が起動時に叩く。
export async function GET() {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ user: null });
  const user = await fetchMe(token).catch(() => null);
  return NextResponse.json({ user });
}
