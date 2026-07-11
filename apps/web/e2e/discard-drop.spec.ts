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

// timeline を持つ編集済み牌譜（/dev/playback）で半歩刻みのステップを検証する。
// 次ボタン1押し目: ツモ牌が手牌右端のスロット（data-tsumo/data-draw）へフライイン
// （盤面は1手前のまま）。2押し目: 打牌が河へ drop し、スロットは消えて手牌が理牌される。
test("次ボタンで半歩ずつ刻む（1押し目=ツモが右端スロットへ、2押し目=打牌が河へ）", async ({
  page,
}) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");
  await expect(page.locator("[data-draw]")).toHaveCount(0);

  // 先頭へ戻す（半歩も巻き戻るため多めに押す。0手で disabled になり過走しない）。
  for (let i = 0; i < 10; i++) await page.getByLabel("1手戻る").click();

  // 1押し目: スロットにフライインが掛かり、河の drop はまだ始まらない。
  await page.getByLabel("1手進む").click();
  const draw = page.locator("[data-draw]");
  await expect(draw).toHaveCount(1);
  expect(await draw.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");
  await expect(page.locator("[data-drop]")).toHaveCount(0);

  // 2押し目: 打牌が河へ落ち、スロットは消える。
  await page.getByLabel("1手進む").click();
  const drop = page.locator("[data-drop]");
  await expect(drop).toHaveCount(1);
  await expect(page.locator("[data-draw]")).toHaveCount(0);
  expect(await drop.evaluate((el) => getComputedStyle(el).animationName)).not.toBe("none");

  // 前ボタンは逆: 打牌を引っ込めてツモ表示に戻る。
  await page.getByLabel("1手戻る").click();
  await expect(page.locator("[data-tsumo]")).toHaveCount(1);
});
