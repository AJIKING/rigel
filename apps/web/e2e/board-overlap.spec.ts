import { expect, test, type Locator } from "@playwright/test";

type Rect = { x: number; y: number; width: number; height: number };
type Named = { seat: string; kind: string; rect: Rect };

const EPS = 1.5; // アンチエイリアス/枠線ぶんの許容。

function overlaps(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width - EPS <= b.x ||
    b.x + b.width - EPS <= a.x ||
    a.y + a.height - EPS <= b.y ||
    b.y + b.height - EPS <= a.y
  );
}

async function tilesOf(seat: Locator, name: string): Promise<Named[]> {
  const boxes = await seat.locator("[data-tile]").all();
  const out: Named[] = [];
  for (const t of boxes) {
    const box = await t.boundingBox();
    const kind = (await t.getAttribute("data-tile")) ?? "hand";
    if (box) out.push({ seat: name, kind, rect: box });
  }
  return out;
}

test("満河の盤面で、牌が席をまたいで重ならない", async ({ page }) => {
  await page.goto("/dev/board");
  await page.waitForSelector("[data-seat] [data-tile]");

  const seatEls = page.locator("[data-seat]");
  const seatNames = await seatEls.evaluateAll((els) =>
    els.map((e) => e.getAttribute("data-seat") ?? "?"),
  );
  expect(seatNames.length).toBe(4);

  const perSeat: Named[][] = [];
  for (let i = 0; i < seatNames.length; i++) {
    perSeat.push(await tilesOf(seatEls.nth(i), seatNames[i]!));
  }

  // 異なる席同士の牌が重ならないことを確認。
  const bad: string[] = [];
  for (let i = 0; i < perSeat.length; i++) {
    for (let j = i + 1; j < perSeat.length; j++) {
      for (const a of perSeat[i]!) {
        for (const b of perSeat[j]!) {
          if (overlaps(a.rect, b.rect)) {
            bad.push(`${a.seat}/${a.kind} ×  ${b.seat}/${b.kind}`);
          }
        }
      }
    }
  }
  expect(bad, `重なり: ${[...new Set(bad)].slice(0, 20).join(" | ")}`).toEqual([]);
});

/** 面子内で隣り合う牌が重なっていないか（横向き牌は rotate で視覚幅が牌の高さぶんに
 *  広がるため、レイアウト箱のままだと隣に食い込む）。 */
async function meldOverlaps(page: import("@playwright/test").Page): Promise<string[]> {
  const melds = page.locator("[data-meld]");
  const count = await melds.count();
  expect(count, "検証用の面子が描画されていること").toBeGreaterThan(0);

  const bad: string[] = [];
  for (let m = 0; m < count; m++) {
    const tiles = await melds.nth(m).locator("[data-tile]").all();
    const rects: Rect[] = [];
    for (const t of tiles) {
      const box = await t.boundingBox();
      if (box) rects.push(box);
    }
    for (let i = 0; i + 1 < rects.length; i++) {
      if (overlaps(rects[i]!, rects[i + 1]!)) bad.push(`meld${m}: ${i}枚目と${i + 1}枚目`);
    }
  }
  return bad;
}

/** 1つの席の中で、どの2枚も重なっていないか（手牌・副露・ツモ牌スロットを跨いで見る）。 */
async function withinSeatOverlaps(page: import("@playwright/test").Page): Promise<string[]> {
  const seats = page.locator("[data-seat]");
  const bad: string[] = [];
  for (let si = 0; si < (await seats.count()); si++) {
    const seat = seats.nth(si);
    const name = (await seat.getAttribute("data-seat")) ?? "?";
    // 河は席の反対側にあり、ここでは手牌側（副露を含む）だけを見る。
    const tiles = await seat.locator('[data-tile]:not([data-tile="river"])').all();
    const items: { kind: string; rect: Rect }[] = [];
    for (const t of tiles) {
      const box = await t.boundingBox();
      if (box) items.push({ kind: (await t.getAttribute("data-tile")) ?? "hand", rect: box });
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (overlaps(items[i]!.rect, items[j]!.rect)) {
          bad.push(`${name}: ${items[i]!.kind}[${i}] × ${items[j]!.kind}[${j}]`);
        }
      }
    }
  }
  return bad;
}

test("何切る: 副露の横向きの牌が隣の牌に重ならない（鳴き元 上家/対面/下家）", async ({ page }) => {
  await page.goto("/dev/problem");
  await page.waitForSelector('[data-seat] [data-tile="meld"]');

  const inMeld = await meldOverlaps(page);
  expect(inMeld, `面子内の重なり: ${inMeld.join(" | ")}`).toEqual([]);

  const inSeat = await withinSeatOverlaps(page);
  expect(inSeat, `席内（手牌×副露）の重なり: ${inSeat.join(" | ")}`).toEqual([]);
});

test("特訓（点数計算）: 副露の横向きの牌が隣の牌に重ならない", async ({ page }) => {
  test.setTimeout(120_000);
  // 出題は seed 固定。横向き牌（暗槓以外の鳴き）を含む出題に当たるまでいくつか試す。
  let checked = 0;
  const bad: string[] = [];
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    await page.goto(`/dev/training?phase=running&kind=score&seed=${seed}`);
    await page.waitForSelector("[data-meld]", { timeout: 5_000 }).catch(() => null);
    if ((await page.locator("[data-meld]").count()) === 0) continue;
    checked++;
    bad.push(...(await meldOverlaps(page)));
  }
  expect(checked, "副露つきの点数計算問題が1問以上描画されること").toBeGreaterThan(0);
  expect(bad, `面子内の重なり: ${[...new Set(bad)].join(" | ")}`).toEqual([]);
});

test("鳴き（副露）の中で、横向きの牌が隣の牌に重ならない", async ({ page }) => {
  await page.goto("/dev/board");
  await page.waitForSelector('[data-seat] [data-tile="meld"]');

  // 面子ごとに、隣り合う牌の矩形が重ならないことを見る（横向き牌は rotate で
  // 視覚幅が牌の高さぶんに広がるため、レイアウト箱のままだと隣に食い込む）。
  const melds = page.locator("[data-meld]");
  const count = await melds.count();
  expect(count, "検証用の面子が描画されていること").toBeGreaterThan(0);

  const bad: string[] = [];
  for (let m = 0; m < count; m++) {
    const tiles = await melds.nth(m).locator("[data-tile]").all();
    const rects: Rect[] = [];
    for (const t of tiles) {
      const box = await t.boundingBox();
      if (box) rects.push(box);
    }
    for (let i = 0; i + 1 < rects.length; i++) {
      if (overlaps(rects[i]!, rects[i + 1]!)) {
        bad.push(`meld${m}: ${i}枚目と${i + 1}枚目`);
      }
    }
  }
  expect(bad, `面子内の重なり: ${bad.join(" | ")}`).toEqual([]);
});

test("満河の河が中央情報ボックスに重ならない", async ({ page }) => {
  await page.goto("/dev/board");
  await page.waitForSelector("[data-center]");
  const center = await page.locator("[data-center]").boundingBox();
  expect(center).not.toBeNull();

  const rivers = await page.locator('[data-seat] [data-tile="river"]').all();
  const bad: number = (
    await Promise.all(
      rivers.map(async (r) => {
        const box = await r.boundingBox();
        return box && center && overlaps(box, center) ? 1 : 0;
      }),
    )
  ).reduce<number>((n, v) => n + v, 0);
  expect(bad, `河が中央に重なった数: ${bad}`).toBe(0);
});
