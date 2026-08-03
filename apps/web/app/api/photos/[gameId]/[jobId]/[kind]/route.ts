import { NextResponse } from "next/server";
import { serverApiBaseUrl } from "../../../../../../lib/api-server";
import { getSessionToken } from "../../../../../../lib/session";

// 元写真（恒久保存・所有者のみ。photo-retention.md）の BFF プロキシ。
// <img src> は Authorization ヘッダを付けられないため、Cookie 認証のこの Route Handler が
// Workers api へ Bearer で取り次ぐ。所有者判定は api 側（他人は 404）。

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ gameId: string; jobId: string; kind: string }> },
) {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { gameId, jobId, kind } = await ctx.params;
  // パスの安全弁（api 側にも kind 許可リストがあるが、変なキーを組み立てて中継しない）。
  if (![gameId, jobId].every((v) => /^[\w-]+$/.test(v)) || !/^[a-z_]+$/.test(kind)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const res = await fetch(`${serverApiBaseUrl()}/games/${gameId}/photos/${jobId}/${kind}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: "not found" }, { status: res.status === 401 ? 401 : 404 });
  }
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "image/jpeg",
      "cache-control": "private, max-age=86400",
    },
  });
}
