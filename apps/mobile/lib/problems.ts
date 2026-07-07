// 出題形式の表示名は @rigel/ui の PROBLEM_KIND_LABELS を使う（web と共有）。
export { PROBLEM_KIND_LABELS as KIND_LABELS } from "@rigel/ui";

/** 公開問題の共有URL（web の回答ページ）。 */
export function problemShareUrl(problemId: string): string {
  return `https://rigel.plaria.co.jp/p/${problemId}`;
}
