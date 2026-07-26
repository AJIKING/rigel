import { describe, expect, it } from "vitest";
import { TILE_VALUES, type Tile } from "@rigel/schema";
import {
  bestDiscards,
  bestUkeires,
  discardUkeires,
  keepUkeires,
  ukeireReviewModel,
} from "./ukeire";
import { createQuizRng } from "./quiz";
import { toCounts, winningTiles } from "./tenpai";
import { shanten } from "./shanten";

/** "123m45p7z" 形式を Tile 配列に展開する（テスト記述用。shanten.test.ts と同形）。 */
function tiles(spec: string): Tile[] {
  const out: Tile[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") digits += ch;
    else {
      for (const d of digits) out.push(`${d}${ch}` as Tile);
      digits = "";
    }
  }
  return out;
}

/** hand から discard を1枚除いた残り13枚（3n+1枚）。 */
function afterDiscard(hand: readonly Tile[], discard: Tile): Tile[] {
  const rest = [...hand];
  rest.splice(rest.indexOf(discard), 1);
  return rest;
}

/** discardUkeires の結果から特定打牌のエントリを取り出す（無ければ失敗させる）。 */
function entryOf(hand: readonly Tile[], discard: Tile, meldCount = 0) {
  const found = discardUkeires(hand, meldCount).find((u) => u.discard === discard);
  expect(found, `打牌 ${discard} のエントリが存在する`).toBeDefined();
  return found!;
}

// ------------------------------------------------------------
// 既知手（期待値は手分解で検算済み）
// ------------------------------------------------------------
// A: 123m 45m 456p 789s 11z 2z … 2z 切りだけがテンパイ（3m/6m 待ち）
const HAND_A = "123m45m456p789s11z2z";
// B: 2344567m 456p 789s 3z … 3z 切りで 1m/4m/7m の3面張（4m/7m 切りは 3z 単騎）
const HAND_B = "2344567m456p789s3z";
// C: 123m 456p 789s 99s 11z 2p … 2p 切りで 6s/9s/1z 待ち（9s は自分が3枚使用）
const HAND_C = "123m456p789s99s11z2p";
// D: 123m9m 123p9p 123s9s 44z … 9m/9p/9s 切りが対称な同率最大
const HAND_D = "1239m1239p1239s44z";
// E: 123m 0m5m6m 456p 789s 11z … 赤5(0m)と5mを両方持つ
const HAND_E = "123056m456p789s11z";
// F: 副露1 + 123m 456m 78m 55z 9s … 9s 切りで 3m/6m/9m 待ち
const HAND_F = "123m456m78m55z9s";
// 和了形14枚（shanten = -1）
const HAND_WIN = "123m456m789m123p55p";

describe("discardUkeires（既知手: 特定打牌の受け入れ種類と枚数を完全一致で固定）", () => {
  it.each<{
    name: string;
    hand: string;
    discard: Tile;
    meldCount?: number;
    shanten: number;
    tiles: Tile[];
    count: number;
  }>([
    {
      name: "A: 2z切りはテンパイ維持で 3m/6m の7枚",
      hand: HAND_A,
      discard: "2z",
      shanten: 0,
      tiles: ["3m", "6m"],
      count: 7,
    },
    {
      // 向聴戻し側の打牌。受け入れ枚数(13)はテンパイ維持の 2z 切り(7)より多い。
      name: "A: 1z切りは1向聴に戻り 3m/6m/1z/2z の13枚",
      hand: HAND_A,
      discard: "1z",
      shanten: 1,
      tiles: ["3m", "6m", "1z", "2z"],
      count: 13,
    },
    {
      name: "B: 3z切りは 1m/4m/7m の3面張9枚（4mは自分が2枚・7mは1枚使用）",
      hand: HAND_B,
      discard: "3z",
      shanten: 0,
      tiles: ["1m", "4m", "7m"],
      count: 9,
    },
    {
      name: "B: 4m切りもテンパイ維持だが 3z 単騎の3枚",
      hand: HAND_B,
      discard: "4m",
      shanten: 0,
      tiles: ["3z"],
      count: 3,
    },
    {
      // 6789s+99s は 678s+999s にも組み直せるので待ちは 6s/9s/1z。
      // 9s は 789s + 99s で自分が3枚使用 → 残り1枚に控除される。
      name: "C: 2p切りは 6s/9s/1z 待ちで 4+1+2=7枚（9s は3枚使用の控除）",
      hand: HAND_C,
      discard: "2p",
      shanten: 0,
      tiles: ["6s", "9s", "1z"],
      count: 7,
    },
    {
      name: "D: 9m切りは 7p/8p/9p/7s/8s/9s/4z の24枚",
      hand: HAND_D,
      discard: "9m",
      shanten: 1,
      tiles: ["7p", "8p", "9p", "7s", "8s", "9s", "4z"],
      count: 24,
    },
    {
      // 待ちの 5m は手牌の 0m+5m を「5が2枚」と同一視して控除する。
      name: "E: 6m切りは 5m/1z シャンポンで 2+2=4枚（赤5は5と同一視して控除）",
      hand: HAND_E,
      discard: "6m",
      shanten: 0,
      tiles: ["5m", "1z"],
      count: 4,
    },
    {
      // 12345678m は 123+456+78 だけでなく 123+345+678 にも組める3面受け（3m/6m/9m）。
      name: "F: 副露1の 9s切りは 3m/6m/9m 待ちの 3+3+4=10枚",
      hand: HAND_F,
      discard: "9s",
      meldCount: 1,
      shanten: 0,
      tiles: ["3m", "6m", "9m"],
      count: 10,
    },
  ])("$name", ({ hand, discard, meldCount, shanten: s, tiles: waits, count }) => {
    const entry = entryOf(tiles(hand), discard, meldCount ?? 0);
    expect(entry.shanten).toBe(s);
    expect(entry.tiles).toEqual(waits);
    expect(entry.count).toBe(count);
  });
});

describe("discardUkeires（並び順: 向聴小 → count大 → 牌コード順）", () => {
  it("A: 先頭はテンパイ維持の 2z（1向聴で受け入れ13枚の 1z より前）", () => {
    const result = discardUkeires(tiles(HAND_A));
    expect(result[0]!.discard).toBe("2z");
    expect(result[0]!.shanten).toBe(0);
  });

  it("B: テンパイ維持3つが count 降順・同率は牌コード順（3z → 4m → 7m）", () => {
    const result = discardUkeires(tiles(HAND_B));
    expect(result.slice(0, 3).map((u) => u.discard)).toEqual(["3z", "4m", "7m"]);
  });
});

describe("bestDiscards（最小向聴を保つ打牌のうち受け入れ最大）", () => {
  it.each<{ name: string; hand: string; meldCount?: number; expected: Tile[] }>([
    { name: "A: 一意（テンパイ維持の 2z のみ）", hand: HAND_A, expected: ["2z"] },
    { name: "B: テンパイ維持の中で受け入れ最大の 3z のみ", hand: HAND_B, expected: ["3z"] },
    { name: "C: 一意（2p のみ）", hand: HAND_C, expected: ["2p"] },
    {
      name: "D: 同率最大が複数（9m/9p/9s。牌コード順）",
      hand: HAND_D,
      expected: ["9m", "9p", "9s"],
    },
    { name: "E: 赤5と通常5が同率で両方正解（5m/0m）", hand: HAND_E, expected: ["5m", "0m"] },
    { name: "F: 副露1でも 9s のみ", hand: HAND_F, meldCount: 1, expected: ["9s"] },
  ])("$name", ({ hand, meldCount, expected }) => {
    expect(bestDiscards(tiles(hand), meldCount ?? 0)).toEqual(expected);
  });

  it("A: 向聴戻しの 1z は受け入れ枚数がテンパイ維持の 2z より多くても正解に入らない", () => {
    const hand = tiles(HAND_A);
    const back = entryOf(hand, "1z");
    const keep = entryOf(hand, "2z");
    expect(back.count).toBeGreaterThan(keep.count); // 前提: 枚数だけなら向聴戻しが勝つ手
    expect(bestDiscards(hand)).toEqual(["2z"]);
  });
});

describe("bestUkeires（見直し用: discardUkeires の結果から正解集合のエントリを返す）", () => {
  // 結果画面（web/mobile の UkeireDetail）が「最小向聴かつ受け入れ最大」の判定を
  // 再実装しないための共有ヘルパ。集合は bestDiscards と常に一致する。
  it.each<{ name: string; hand: string; meldCount?: number }>([
    { name: "A: 一意（テンパイ維持の 2z のみ）", hand: HAND_A },
    { name: "B: テンパイ維持の中で受け入れ最大の 3z のみ", hand: HAND_B },
    { name: "C: 一意（2p のみ）", hand: HAND_C },
    { name: "D: 同率最大が複数（9m/9p/9s）", hand: HAND_D },
    { name: "E: 赤5と通常5が同率で両方正解", hand: HAND_E },
    { name: "F: 副露1でも 9s のみ", hand: HAND_F, meldCount: 1 },
  ])(
    "$name: 打牌集合が bestDiscards と一致し、エントリは discardUkeires のものそのまま",
    ({ hand, meldCount }) => {
      const all = discardUkeires(tiles(hand), meldCount ?? 0);
      const best = bestUkeires(all);
      expect(best.map((u) => u.discard)).toEqual(bestDiscards(tiles(hand), meldCount ?? 0));
      // エントリ再計算はしない（discardUkeires の同一オブジェクトを返す）。
      for (const entry of best) expect(all).toContain(entry);
    },
  );

  it("A: 向聴戻し（1z）は受け入れ枚数が多くても正解集合に入らない", () => {
    const all = discardUkeires(tiles(HAND_A));
    expect(bestUkeires(all).map((u) => u.discard)).toEqual(["2z"]);
  });

  it("入力が未ソートでも同じ集合を入力順で返す（D を逆順で渡す）", () => {
    const reversed = [...discardUkeires(tiles(HAND_D))].reverse();
    expect(bestUkeires(reversed).map((u) => u.discard)).toEqual(["9s", "9p", "9m"]);
  });

  it("空配列（不正枚数の手）は空配列", () => {
    expect(bestUkeires([])).toEqual([]);
  });
});

describe("ukeireReviewModel（見直し行のヘッドレス計算。web/mobile の UkeireDetail が共有）", () => {
  it.each<{
    name: string;
    hand: string;
    picked: Tile | null;
    regressed: boolean;
  }>([
    { name: "A: 正解打牌（2z）は向聴戻しでない", hand: HAND_A, picked: "2z", regressed: false },
    { name: "A: 向聴戻し打牌（1z）は regressed", hand: HAND_A, picked: "1z", regressed: true },
    { name: "D: 同率最大のひとつ（9p）", hand: HAND_D, picked: "9p", regressed: false },
  ])("$name", ({ hand, picked, regressed }) => {
    const model = ukeireReviewModel(tiles(hand), picked);
    // minShanten / mine / best は discardUkeires・bestUkeires と一致する
    //（画面側で再実装しないための一元化）。ukeires は最小向聴を保つ打牌だけ
    //（見直しは正解集合と自分の回答しか出さないため。向聴戻しの回答は mine に入る）。
    const all = discardUkeires(tiles(hand));
    expect(model.ukeires).toEqual(all.filter((u) => u.shanten === all[0]!.shanten));
    expect(model.minShanten).toBe(all[0]!.shanten);
    expect(model.mine).toEqual(all.find((u) => u.discard === picked));
    expect(model.regressed).toBe(regressed);
    expect(model.best.map((u) => u.discard)).toEqual(bestDiscards(tiles(hand)));
  });

  it("picked=null（打ち切り等で回答が無い）は mine=undefined・regressed=false", () => {
    const model = ukeireReviewModel(tiles(HAND_A), null);
    expect(model.mine).toBeUndefined();
    expect(model.regressed).toBe(false);
    expect(model.best.map((u) => u.discard)).toEqual(["2z"]);
  });

  it("picked が手牌に無い牌でも壊れない（mine=undefined）", () => {
    const model = ukeireReviewModel(tiles(HAND_A), "9p");
    expect(model.mine).toBeUndefined();
    expect(model.regressed).toBe(false);
  });
});

describe("discardUkeires（赤5: 0m と 5m は別候補として両方返り効率は同値）", () => {
  it("E: 0m/5m の両エントリが存在し shanten・tiles・count が一致する", () => {
    const result = discardUkeires(tiles(HAND_E));
    const red = result.find((u) => u.discard === "0m");
    const plain = result.find((u) => u.discard === "5m");
    expect(red).toBeDefined();
    expect(plain).toBeDefined();
    expect(red!.shanten).toBe(plain!.shanten);
    expect(red!.tiles).toEqual(plain!.tiles);
    expect(red!.count).toBe(plain!.count);
  });
});

describe("discardUkeires（和了形14枚: 全打牌がテンパイ維持で winningTiles と整合）", () => {
  it("全エントリが shanten=0 で受け入れ＝切った後の待ち牌・枚数は残数控除と一致する", () => {
    const hand = tiles(HAND_WIN);
    const result = discardUkeires(hand);
    expect(result.length).toBe(new Set(hand).size); // 重複を除いた打牌候補ぶん
    for (const entry of result) {
      const rest = afterDiscard(hand, entry.discard);
      expect(entry.shanten).toBe(0);
      expect(entry.tiles).toEqual(winningTiles(rest));
      const counts = toCounts(rest);
      const kinds: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0");
      const expectedCount = entry.tiles.reduce((sum, t) => sum + 4 - counts[kinds.indexOf(t)]!, 0);
      expect(entry.count).toBe(expectedCount);
    }
  });
});

describe("discardUkeires / bestDiscards（不正枚数は空配列）", () => {
  it.each<{ name: string; hand: string; meldCount?: number }>([
    { name: "13枚（3n+1）", hand: "123456789m1234p" },
    { name: "15枚", hand: "123m456m789m123p556p" },
    { name: "0枚", hand: "" },
    { name: "14枚 + meldCount=1（合計17枚相当の不整合）", hand: HAND_A, meldCount: 1 },
    { name: "meldCount が負", hand: HAND_A, meldCount: -1 },
    { name: "meldCount が非整数", hand: HAND_A, meldCount: 0.5 },
  ])("$name は空配列", ({ hand, meldCount }) => {
    expect(discardUkeires(tiles(hand), meldCount ?? 0)).toEqual([]);
    expect(bestDiscards(tiles(hand), meldCount ?? 0)).toEqual([]);
  });
});

// ------------------------------------------------------------
// 性質テスト: tiles の各受け入れ牌は実際に shanten を1進め、tiles 外は進めない
// （shanten との自己整合を機械検証。シード固定で決定的）
// ------------------------------------------------------------

// シード固定の乱数は quiz.ts の createQuizRng（mulberry32）に一元化した。

/** pool から重複なしで n 枚引く（Fisher–Yates の先頭 n 枚）。 */
function draw(pool: readonly Tile[], n: number, rand: () => number): Tile[] {
  const wall = [...pool];
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [wall[i], wall[j]] = [wall[j]!, wall[i]!];
  }
  return wall.slice(0, n);
}

describe("discardUkeires と shanten の整合（性質テスト・シード固定50手）", () => {
  const KINDS: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0"); // 34種（赤抜き）
  const FULL_WALL: readonly Tile[] = KINDS.flatMap((t) => [t, t, t, t]);

  it("各打牌の tiles は shanten を1進める牌に一致し count は残数控除の合計になる", () => {
    const rand = createQuizRng(20260725);
    const mismatches: string[] = [];
    for (let h = 0; h < 50; h++) {
      const hand = draw(FULL_WALL, 14, rand);
      const result = discardUkeires(hand);
      expect(result.length).toBe(new Set(hand).size);
      for (const entry of result) {
        const rest = afterDiscard(hand, entry.discard);
        if (shanten(rest) !== entry.shanten) {
          mismatches.push(`${hand.join("")} 打${entry.discard}: shanten不一致`);
        }
        const counts = toCounts(rest);
        let count = 0;
        for (let k = 0; k < 34; k++) {
          if (counts[k]! >= 4) continue; // 5枚目は存在しない
          const t = KINDS[k]!;
          const advanced = shanten([...rest, t]) === entry.shanten - 1;
          if (advanced !== entry.tiles.includes(t)) {
            mismatches.push(`${hand.join("")} 打${entry.discard} 摸${t}: 受け入れ判定不一致`);
          }
          if (advanced) count += 4 - counts[k]!;
        }
        if (count !== entry.count) {
          mismatches.push(`${hand.join("")} 打${entry.discard}: count ${entry.count} ≠ ${count}`);
        }
      }
      // 並び順の不変条件: 向聴小 → count大 → 牌コード順。
      for (let i = 1; i < result.length; i++) {
        const a = result[i - 1]!;
        const b = result[i]!;
        const ordered =
          a.shanten < b.shanten ||
          (a.shanten === b.shanten &&
            (a.count > b.count ||
              (a.count === b.count &&
                TILE_VALUES.indexOf(a.discard) < TILE_VALUES.indexOf(b.discard))));
        if (!ordered) mismatches.push(`${hand.join("")}: 並び順違反 ${a.discard}→${b.discard}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("性能: 14枚1手の discardUkeires が実用時間（1秒以内・CI 揺らぎ込みの緩い上限）", () => {
    const rand = createQuizRng(1);
    const hand = draw(FULL_WALL, 14, rand);
    const start = Date.now();
    discardUkeires(hand);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("discardUkeires（受け入れ候補の限定: 清一色の出題で他色を数えない）", () => {
  // 単色13枚＋他色1枚。七対子の受け入れとして他色が混ざる手を使う
  // （清一色の出題では「同色だけで広くなるか」を問うので、他色は数えてはいけない）。
  const SUIT_M: Tile[] = TILE_VALUES.filter((t) => t.endsWith("m") && t !== "0m") as Tile[];

  it("候補を同色9種に絞ると、受け入れ牌は同色だけになる", () => {
    // 1112244557788m（順子が作れない6種・6対子）＋他色1枚。9p を切ると七対子1向聴で、
    // 「7種類目」を引けば聴牌するため、34種のままだと未使用の他色すべてが受け入れに入る。
    const hand = tiles("1112244557788m9p");
    const all = discardUkeires(hand).find((u) => u.discard === "9p")!;
    const suited = discardUkeires(hand, 0, SUIT_M).find((u) => u.discard === "9p")!;

    expect(all.tiles.some((t) => !t.endsWith("m"))).toBe(true); // 絞らないと他色が入る
    expect(suited.tiles.every((t) => t.endsWith("m"))).toBe(true);
    expect(suited.count).toBeLessThan(all.count);
  });

  it("向聴数は候補の限定に影響されない（切った後の手は同じ）", () => {
    const hand = tiles("1112244557788m9p");
    for (const u of discardUkeires(hand, 0, SUIT_M)) {
      expect(u.shanten).toBe(shanten(afterDiscard(hand, u.discard)));
    }
  });

  it("候補を省略すると従来どおり34種すべてを見る（既存の呼び出しは不変）", () => {
    const hand = tiles(HAND_A);
    expect(discardUkeires(hand, 0, undefined)).toEqual(discardUkeires(hand));
  });
});

describe("discardUkeires（テンパイ打牌の受け入れ = 待ち牌。高速路と shanten 定義の同値）", () => {
  // 0向聴では「向聴が1つ進む牌」= 和了牌なので、winningTiles と一致しなければならない。
  // discardUkeires はこの同値を使ってテンパイ手を高速化している（単色手では shanten が
  // 1回 0.3ms 前後かかり、34種×14打牌の総当たりが重いため）。ここを壊すと採点が狂う。
  const rng = createQuizRng(20260726);
  const wall: Tile[] = TILE_VALUES.filter((t) => !t.startsWith("0")).flatMap((t) => [
    t,
    t,
    t,
    t,
  ]) as Tile[];

  /** shanten だけで定義した受け入れ（高速路を使わない素朴版）。 */
  function naive(rest: readonly Tile[]): Tile[] {
    const after = shanten(rest);
    const counts = toCounts(rest);
    return TILE_VALUES.filter((t) => !t.startsWith("0")).filter((t, _i) => {
      const k = toCounts([t]).findIndex((n) => n > 0);
      return counts[k]! < 4 && shanten([...rest, t]) === after - 1;
    }) as Tile[];
  }

  // 素朴版（naive）は1打牌あたり34回の向聴計算を回すので重い。性質を示すのに数は要らないので
  // 検査する打牌数を絞る（多くすると CI の並列実行でタイムアウトする）。
  it("シード固定の手で、テンパイ打牌の受け入れが winningTiles と一致する", () => {
    let checked = 0;
    for (let i = 0; i < 60 && checked < 6; i++) {
      const hand = [...wall].sort(() => rng() - 0.5).slice(0, 14);
      for (const u of discardUkeires(hand)) {
        if (u.shanten !== 0 || checked >= 6) continue;
        checked++;
        const rest = afterDiscard(hand, u.discard);
        expect(u.tiles).toEqual(winningTiles(rest));
        expect(u.tiles).toEqual(naive(rest));
      }
    }
    expect(checked, "テンパイになる打牌を1つ以上検査している").toBeGreaterThan(0);
  });

  it("既知手: 和了形14枚はどの打牌もテンパイ維持で、受け入れ=待ち牌", () => {
    const hand = tiles("123456789m11122p");
    for (const u of discardUkeires(hand)) {
      expect(u.shanten).toBe(0);
      expect(u.tiles).toEqual(winningTiles(afterDiscard(hand, u.discard)));
    }
  });
});

describe("ukeireReviewModel（候補の限定: 見直しの受け入れ詳細を出題と同じ物差しで出す）", () => {
  const SUIT_M2: Tile[] = TILE_VALUES.filter((t) => t.endsWith("m") && t !== "0m") as Tile[];

  it("候補を同色9種に絞ると、見直しの受け入れも同色だけになる", () => {
    const hand = tiles("1112244557788m9p");
    const model = ukeireReviewModel(hand, "9p", SUIT_M2);
    for (const u of model.ukeires) {
      expect(u.tiles.every((t) => t.endsWith("m"))).toBe(true);
    }
  });

  it("正解集合は出題側（bestUkeires + 同じ候補）と一致する（採点の二重実装をしない）", () => {
    const hand = tiles("1112244557788m9p");
    const expected = bestUkeires(discardUkeires(hand, 0, SUIT_M2));
    expect(ukeireReviewModel(hand, "9p", SUIT_M2).best).toEqual(expected);
  });
});

describe("keepUkeires（最小向聴を保つ打牌だけ計算する: 清一色で総当たりを避ける）", () => {
  const SUIT_M3: Tile[] = TILE_VALUES.filter((t) => t.endsWith("m") && t !== "0m") as Tile[];

  it("最小向聴を保つ打牌だけを返す（向聴戻しの打牌は含まない）", () => {
    const hand = tiles(HAND_A);
    const all = discardUkeires(hand);
    const min = all[0]!.shanten;
    const keep = keepUkeires(hand);

    expect(keep.length).toBeGreaterThan(0);
    expect(keep.every((u) => u.shanten === min)).toBe(true);
    expect(keep.length).toBe(all.filter((u) => u.shanten === min).length);
  });

  it("返すエントリは discardUkeires と完全に同じ（枝刈りで値を変えない）", () => {
    for (const [hand, cand] of [
      [tiles(HAND_A), undefined],
      [tiles("1112244557788m9p"), SUIT_M3],
    ] as const) {
      const min = discardUkeires(hand, 0, cand)[0]!.shanten;
      expect(keepUkeires(hand, 0, cand)).toEqual(
        discardUkeires(hand, 0, cand).filter((u) => u.shanten === min),
      );
    }
  });

  it("正解集合は discardUkeires 経由と一致する（採点の物差しを変えない）", () => {
    const hand = tiles(HAND_A);
    expect(bestUkeires(keepUkeires(hand))).toEqual(bestUkeires(discardUkeires(hand)));
  });
});
