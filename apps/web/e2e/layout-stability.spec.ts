import { expect, test, type Page } from "@playwright/test";
import { rewindToStart, settleAnimations } from "./helpers";

// 再生ステップでのレイアウト安定の実ブラウザ検証。演出（drop/フライイン）対象の牌
// 以外は、半歩を進めても位置が動かないことを固定する。
// 揺れの原因: 席が中央揃えのため、(a) 河の最長段が伸びると河ブロックが半牌シフト、
// (b) ツモスロット出現で手牌行が半牌シフト。jsdom では測れないため e2e で担う。

async function box(page: Page, selector: string) {
  const b = await page.locator(selector).first().boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

function expectSamePos(a: { x: number; y: number }, b: { x: number; y: number }, label: string) {
  expect(Math.abs(a.x - b.x), `${label} x`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(a.y - b.y), `${label} y`).toBeLessThanOrEqual(0.5);
}

test("半歩を進めても、演出対象以外の牌（手牌・河・隣席）は動かない", async ({ page }) => {
  await page.goto("/dev/playback");
  await page.waitForSelector("[data-seat] [data-tile]");

  await rewindToStart(page);

  const bottomHand = '[data-seat="bottom"] [data-tile="hand"]';
  const rightHand = '[data-seat="right"] [data-tile="hand"]';

  const hand0 = await box(page, bottomHand);
  const right0 = await box(page, rightHand);

  // 1押し目（東のツモ半歩）: スロットが出ても既存の手牌・隣席は動かない。
  await page.getByLabel("1手進む").click();
  await expect(page.locator("[data-tsumo]")).toHaveCount(1);
  await settleAnimations(page);
  expectSamePos(await box(page, bottomHand), hand0, "draw 半歩の自席手牌");
  expectSamePos(await box(page, rightHand), right0, "draw 半歩の隣席手牌");

  // 2押し目（打牌）: 河に1枚落ちる。手牌・隣席は動かない。
  await page.getByLabel("1手進む").click();
  await settleAnimations(page);
  expectSamePos(await box(page, bottomHand), hand0, "drop 後の自席手牌");
  expectSamePos(await box(page, rightHand), right0, "drop 後の隣席手牌");

  // 以降のステップで、置かれた河の1枚目が動かない（河ブロックのシフト検知）。
  const bottomRiver = '[data-seat="bottom"] [data-tile="river"]';
  const river0 = await box(page, bottomRiver);
  // 南の手番（2半歩）→ 東のツモ切り（2半歩）まで進める。
  for (let i = 0; i < 4; i++) {
    await page.getByLabel("1手進む").click();
    await settleAnimations(page);
    expectSamePos(await box(page, bottomRiver), river0, `step+${i + 1} の河1枚目`);
    expectSamePos(await box(page, bottomHand), hand0, `step+${i + 1} の自席手牌`);
  }
});
