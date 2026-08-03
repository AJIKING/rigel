import { NextResponse } from "next/server";
import { isSafePhotoParams, proxyPhoto } from "../../../../../../lib/photo-proxy";

// 半荘の元写真（恒久保存・所有者のみ。photo-retention.md）の BFF プロキシ。
// 中継の共通部（Cookie→Bearer・private キャッシュ）は lib/photo-proxy.ts。

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ gameId: string; jobId: string; kind: string }> },
) {
  const { gameId, jobId, kind } = await ctx.params;
  if (!isSafePhotoParams([gameId, jobId], kind)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return proxyPhoto(`/games/${gameId}/photos/${jobId}/${kind}`);
}
