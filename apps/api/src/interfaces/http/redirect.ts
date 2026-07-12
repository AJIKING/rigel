// interfaces/http — 外部（Stripe）へ渡すリダイレクト先の検証。
//
// 決済の success/cancel/return URL はクライアントが送る値をそのまま Stripe に渡していた。
// Stripe 側で http(s) に限られるため反射型フィッシングにはならないが、任意サイトへの
// 誘導が成立しうる（オープンリダイレクト隣接）。多重防御として、自分のオリジンと
// アプリのカスタムスキームだけに限定する。

/** mobile の戻り先（app.json の scheme）。 */
const APP_SCHEME = "jp.co.plaria.rigel://";

/** ローカル開発の戻り先（CORS の DEV_ORIGINS と揃える）。 */
const DEV_ORIGINS = ["http://localhost:3000"];

/** 決済からの戻り先として許可された URL か。 */
export function isAllowedRedirect(url: string, allowedOrigins: string | undefined): boolean {
  if (url.startsWith(APP_SCHEME)) return true;
  const allow = [
    ...(allowedOrigins ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    ...DEV_ORIGINS,
  ];
  try {
    return allow.includes(new URL(url).origin);
  } catch {
    return false; // URL として解釈できない（javascript: 等を含む）
  }
}
