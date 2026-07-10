import { expect, test, type Page } from "@playwright/test";

/** 卓面（.main）下端と viewport 下端の隙間(px)。帯が出ていなければ 0 以下。 */
function gapBelowMain(page: Page): Promise<number> {
  return page.evaluate(() => {
    const main = document.querySelector("[data-main]");
    return main ? window.innerHeight - main.getBoundingClientRect().bottom : Number.NaN;
  });
}

// 全画面時のレイアウト検証。ヘッダー（.bar/.khead）とサイドを消すと、ページの高さを
// 支えていた .side の min-height も消え、卓面（.main）の下にヘッダー分の帯（.app の
// chrome 背景）が出る退行があった。実ブラウザで「卓面が viewport 下端まで満たされる」
// ことを測って固定する（jsdom はレイアウトを計算しないため e2e で担う）。
// 症状は「卓＋コントロールバーより縦に余裕がある画面」でだけ出るため、縦長ビューポートで測る。
test.use({ viewport: { width: 1280, height: 1100 } });
test("全画面にしても卓面が画面下端まで満たされる（下にヘッダー分の帯が出ない）", async ({
  page,
}) => {
  await page.goto("/dev/board");
  await page.waitForSelector("[data-seat] [data-tile]");

  await page.getByLabel("全画面", { exact: true }).click();

  expect(await gapBelowMain(page)).toBeLessThanOrEqual(1);
});

// 全画面でなくても「情報」パネルを閉じる（noSide）と同じ帯が出うる（同根の副症状）。
test("情報パネルを閉じても卓面が画面下端まで満たされる", async ({ page }) => {
  await page.goto("/dev/board");
  await page.waitForSelector("[data-seat] [data-tile]");

  await page.getByRole("button", { name: "情報" }).click();

  expect(await gapBelowMain(page)).toBeLessThanOrEqual(1);
});
