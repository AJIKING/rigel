import { NextResponse } from "next/server";
import { serverApiBaseUrl } from "../../../../../../../lib/api-server";
import { getSessionToken } from "../../../../../../../lib/session";

// 何切るの元写真（恒久保存・所有者のみ。photo-retention.md）の BFF プロキシ。
// refType: "problem"（正規保存済み）| "draft"（解析下書き）。所有者判定は api 側。

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ refType: string; refId: string; jobId: string; kind: string }> },
) {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { refType, refId, jobId, kind } = await ctx.params;
  if (
    (refType !== "problem" && refType !== "draft") ||
    ![refId, jobId].every((v) => /^[\w-]+$/.test(v)) ||
    !/^[a-z_]+$/.test(kind)
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const base = refType === "problem" ? `/problems/${refId}` : `/problems/drafts/${refId}`;
  const res = await fetch(`${serverApiBaseUrl()}${base}/photos/${jobId}/${kind}`, {
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
