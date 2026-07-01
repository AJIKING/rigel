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
