import { NextResponse } from "next/server";
import { isSafePhotoParams, proxyPhoto } from "../../../../../../../lib/photo-proxy";

// 何切るの元写真（恒久保存・所有者のみ。photo-retention.md）の BFF プロキシ。
// refType: "problem"（正規保存済み）| "draft"（解析下書き）。所有者判定は api 側。
// 中継の共通部（Cookie→Bearer・private キャッシュ）は lib/photo-proxy.ts。

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ refType: string; refId: string; jobId: string; kind: string }> },
) {
  const { refType, refId, jobId, kind } = await ctx.params;
  if ((refType !== "problem" && refType !== "draft") || !isSafePhotoParams([refId, jobId], kind)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const base = refType === "problem" ? `/problems/${refId}` : `/problems/drafts/${refId}`;
  return proxyPhoto(`${base}/photos/${jobId}/${kind}`);
}
