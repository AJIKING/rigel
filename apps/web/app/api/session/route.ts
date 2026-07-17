import { NextResponse } from "next/server";
import { authWithApple, authWithGoogle } from "../../../lib/api-server";
import { clearSessionCookie, setSessionCookie } from "../../../lib/session";

// BFF のログイン/ログアウト。ブラウザは Workers api を直接叩かず、同一オリジンの
// この Route Handler 経由でセッション Cookie を張る/破棄する。

// Route Handler は Server Action と違い Next の Origin チェックが入らないので、
// 状態変更（Cookie 設定/破棄）はここで同一オリジンを必須にする（ログイン CSRF/固定化対策）。
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** POST: Google/Apple の idToken を Workers api で検証し、成功したらセッション Cookie を張る。
 *  provider 省略時は Google（後方互換）。Apple は authorizationCode（退会時の失効用）も渡せる。 */
export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    idToken?: unknown;
    provider?: unknown;
    authorizationCode?: unknown;
  };
  if (typeof body.idToken !== "string" || !body.idToken) {
    return NextResponse.json({ error: "idToken required" }, { status: 400 });
  }
  const result =
    body.provider === "apple"
      ? await authWithApple(
          body.idToken,
          typeof body.authorizationCode === "string" ? body.authorizationCode : undefined,
        ).catch(() => null)
      : await authWithGoogle(body.idToken).catch(() => null);
  if (!result) {
    return NextResponse.json({ error: "authentication failed" }, { status: 401 });
  }
  await setSessionCookie(result.sessionToken);
  return NextResponse.json({ user: result.user });
}

/** DELETE: ログアウト。Cookie を破棄する。 */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
