import { expect, test } from "@playwright/test";

// 打牌の drop-in 演出の実ブラウザ検証。jsdom は CSS Module の keyframes を解決
// できないため、「data-drop の牌に実際にアニメーションが掛かる」ことは Chromium
// の computed style で確認する。
test("1手進めたとき、直近の打牌1枚に drop-in アニメーションが掛かる", async ({ page }) => {
  await page.goto("/dev/board");
  await page.waitForSelector("[data-seat] [data-tile]");

  // 初期の全表示では演出しない。
  await expect(page.locator("[data-drop]")).toHaveCount(0);

  // 1手戻ってから1手進む → いま置かれた1枚だけに演出が付く。
  await page.getByLabel("1手戻る").click();
  await expect(page.locator("[data-drop]")).toHaveCount(0);
  await page.getByLabel("1手進む").click();

  const drop = page.locator("[data-drop]");
  await expect(drop).toHaveCount(1);
  const animation = await drop.evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).not.toBe("none");
});

// timeline を持つ編集済み牌譜（/dev/playback）でツモ演出を検証する。
test("手出しの1手はツモ牌がフライインし、打牌の drop は遅れて始まる", async ({ page }) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");
  await expect(page.locator("[data-draw]")).toHaveCount(0);

  // 先頭へ戻して1手進む（1手目=東の手出し）。
  for (let i = 0; i < 5; i++) await page.getByLabel("1手戻る").click();
  await page.getByLabel("1手進む").click();

  const draw = page.locator("[data-draw]");
  await expect(draw).toHaveCount(1);
  expect(await draw.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  // 同じ手の打牌 drop はツモの後（遅延あり）。
  const drop = page.locator("[data-drop]");
  await expect(drop).toHaveCount(1);
  expect(await drop.evaluate((el) => getComputedStyle(el).animationDelay)).not.toBe("0s");
});

test("ツモ切りの1手は手牌のフライインを出さない（河の drop のみ・遅延なし）", async ({ page }) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");

  // 先頭へ戻して3手進む（3手目=東のツモ切り）。
  for (let i = 0; i < 5; i++) await page.getByLabel("1手戻る").click();
  for (let i = 0; i < 3; i++) await page.getByLabel("1手進む").click();

  await expect(page.locator("[data-draw]")).toHaveCount(0);
  const drop = page.locator("[data-drop]");
  await expect(drop).toHaveCount(1);
  expect(await drop.evaluate((el) => getComputedStyle(el).animationDelay)).toBe("0s");
});
