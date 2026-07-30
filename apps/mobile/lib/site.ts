// mobile から web サイトの URL を組む唯一の場所。共有シート・決済の戻り先で使う。
// ドメイン変更時、mobile はここだけ直せばよい（web/api 側の既定は各アプリが持つ:
// web=lib/og-meta.ts・lib/api-server.ts / CI=deploy.web.yml / api=wrangler.toml）。

export const SITE_ORIGIN = "https://raisha.jp";

/** 公開牌譜の共有URL（web の公開ビューア）。 */
export function kifuShareUrl(gameId: string): string {
  return `${SITE_ORIGIN}/k/${gameId}`;
}

/** 公開の何切る問題の共有URL（web の回答ページ）。 */
export function problemShareUrl(problemId: string): string {
  return `${SITE_ORIGIN}/p/${problemId}`;
}
