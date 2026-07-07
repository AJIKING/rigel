// web（rigel サイト）の URL を組む唯一の場所。共有シート・決済の戻り先で使う。
// ドメイン変更時はここだけ直せばよい。

export const SITE_ORIGIN = "https://rigel.plaria.co.jp";

/** 公開牌譜の共有URL（web の公開ビューア）。 */
export function kifuShareUrl(gameId: string): string {
  return `${SITE_ORIGIN}/k/${gameId}`;
}

/** 公開の何切る問題の共有URL（web の回答ページ）。 */
export function problemShareUrl(problemId: string): string {
  return `${SITE_ORIGIN}/p/${problemId}`;
}
