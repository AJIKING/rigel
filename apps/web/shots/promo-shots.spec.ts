import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { PROMO_SHOTS, type PromoShot } from "../lib/promo-shots";

// ストア用プロモ画像の撮影。/dev/promo の各フレーム（data-shot）を
// マニフェスト（lib/promo-shots.ts）どおりの倍率で撮り、リポジトリの
// docs/store-assets/ へ書き出す。出力ピクセル = CSS 寸法 × deviceScaleFactor。
const OUT_DIR = fileURLToPath(new URL("../../../docs/store-assets", import.meta.url));

/** deviceScaleFactor はコンテキスト単位でしか変えられないため、倍率ごとにまとめる。 */
function byScaleFactor(): Map<number, PromoShot[]> {
  const groups = new Map<number, PromoShot[]>();
  for (const shot of PROMO_SHOTS) {
    const list = groups.get(shot.deviceScaleFactor) ?? [];
    list.push(shot);
    groups.set(shot.deviceScaleFactor, list);
  }
  return groups;
}

test("ストア用プロモ画像を docs/store-assets/ へ出力する", async ({ browser }) => {
  for (const [dsf, shots] of byScaleFactor()) {
    const context = await browser.newContext({
      viewport: { width: 1200, height: 1000 },
      deviceScaleFactor: dsf,
    });
    const page = await context.newPage();
    await page.goto("/dev/promo");
    // Next の dev インジケータ（左下の N ボタン）はフレームに重なって写るため隠す。
    await page.addStyleTag({ content: "nextjs-portal{display:none !important;}" });
    // 字形とビットマップの焼き付けなので、Web フォントと牌画像（SVG）の
    // 読み込み完了を待ってから撮る（未ロードだと代替字形・空白牌で写る）。
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() =>
      Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
    );
    for (const shot of shots) {
      const frame = page.locator(`[data-shot="${shot.id}"]`);
      // フレームの実寸がマニフェストとズレたまま撮ると、ストア規定サイズに
      // ならない（アップロードで弾かれる）ため、撮影前に検証する。
      const box = await frame.boundingBox();
      expect(box, `frame ${shot.id} が描画されている`).not.toBeNull();
      expect(box!.width, `frame ${shot.id} の幅`).toBe(shot.cssWidth);
      expect(box!.height, `frame ${shot.id} の高さ`).toBe(shot.cssHeight);
      const out = path.join(OUT_DIR, shot.file);
      await frame.screenshot({ path: out, animations: "disabled", scale: "device" });
      // 出力 PNG の実寸（IHDR）を検証する。フレームの座標が小数になると
      // クリップが1px 切り上がり、規定サイズから静かにズレるため（実測 2026-07-30）。
      const png = fs.readFileSync(out);
      expect(png.readUInt32BE(16), `${shot.file} の出力幅`).toBe(shot.cssWidth * dsf);
      expect(png.readUInt32BE(20), `${shot.file} の出力高さ`).toBe(shot.cssHeight * dsf);
    }
    await context.close();
  }
});
