import "server-only";
import { NextResponse } from "next/server";
import { serverApiBaseUrl } from "./api-server";
import { getSessionToken } from "./session";

// 元写真の BFF プロキシ共通部（photo-retention.md）。<img src> は Authorization を
// 付けられないため、Cookie 認証の Route Handler が Workers api へ Bearer で取り次ぐ。
// 所有者判定は api 側（他人は 404）。本人専用画像なので共有キャッシュには乗せない。
//
// 注意: /api/photos と /api/problem-photos の2ルートを catch-all 1本に畳まないこと。
// 上流パスをクライアント入力から組み立てる中継になり、写真以外の api を Bearer 付きで
// 叩ける口が開く。ルートは固定パスのまま、この関数だけを共有する。

const ID_RE = /^[\w-]+$/;
const KIND_RE = /^[a-z_]+$/;

/** パスの安全弁（api 側にも kind 許可リストがあるが、変なキーを組み立てて中継しない）。 */
export function isSafePhotoParams(ids: string[], kind: string): boolean {
  return ids.every((v) => ID_RE.test(v)) && KIND_RE.test(kind);
}

/** api の写真エンドポイント（固定プレフィックスの upstreamPath）へ Cookie→Bearer で中継する。 */
export async function proxyPhoto(upstreamPath: string): Promise<Response> {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const res = await fetch(`${serverApiBaseUrl()}${upstreamPath}`, {
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
