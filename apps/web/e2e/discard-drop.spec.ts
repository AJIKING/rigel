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

// timeline を持つ編集済み牌譜（/dev/playback）で二段階のステップ演出を検証する。
// 第1段: ツモ牌が手牌右端のスロット（data-tsumo/data-draw）へフライイン（盤面は1手前のまま）。
// 第2段: 打牌が河へ drop し、スロットは消えて手牌が理牌される。
test("手出しの1手は、ツモ牌が右端スロットへ入ってから打牌が河へ落ちる（二段階）", async ({
  page,
}) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");
  await expect(page.locator("[data-draw]")).toHaveCount(0);

  // 先頭へ戻して1手進む（1手目=東の手出し）。
  for (let i = 0; i < 5; i++) await page.getByLabel("1手戻る").click();
  await page.getByLabel("1手進む").click();

  // 第1段: スロットにフライインが掛かり、河の drop はまだ始まらない。
  const draw = page.locator("[data-draw]");
  await expect(draw).toHaveCount(1);
  expect(await draw.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  await expect(page.locator("[data-drop]")).toHaveCount(0);

  // 第2段: 打牌が河へ落ち、スロットは消える。
  const drop = page.locator("[data-drop]");
  await expect(drop).toHaveCount(1);
  await expect(page.locator("[data-draw]")).toHaveCount(0);
  expect(await drop.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
});

test("ツモ切りの1手も同じ二段階（右端スロットに入ってからそのまま河へ）", async ({ page }) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");

  // 先頭へ戻して2手進めてから3手目（=東のツモ切り）へ。
  for (let i = 0; i < 5; i++) await page.getByLabel("1手戻る").click();
  for (let i = 0; i < 2; i++) {
    await page.getByLabel("1手進む").click();
    // 前の手の演出（第2段まで）を待ってから次へ（連打の挙動はここでは対象外）。
    await expect(page.locator("[data-drop]")).toHaveCount(1);
  }
  await page.getByLabel("1手進む").click();

  await expect(page.locator("[data-draw]")).toHaveCount(1);
  await expect(page.locator("[data-drop]")).toHaveCount(0);
  await expect(page.locator("[data-drop]")).toHaveCount(1);
  await expect(page.locator("[data-draw]")).toHaveCount(0);
});
