import type { Page } from "@playwright/test";

/** 再生を先頭（0手）まで巻き戻す。半歩も巻き戻り、0手で disabled になったら止まる。 */
export async function rewindToStart(page: Page): Promise<void> {
  const back = page.getByLabel("1手戻る");
  while (!(await back.isDisabled())) await back.click();
}

/** 実行中の CSS アニメーション（drop/フライイン等）が終わるまで待つ（固定スリープ不要）。 */
export function settleAnimations(page: Page): Promise<unknown> {
  return page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}
