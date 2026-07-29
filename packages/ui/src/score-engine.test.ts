// 採点エンジン v2（任意の和了手 → 高点法で翻・符・点数）のテスト。
// 期待値はすべて手検算（分解・符内訳をコメントに記す）。点数の最終段は score.ts の
// handScore と同じ値になること（7700/11600 などの古典点は kiriage:false で検証）。
import { describe, expect, it } from "vitest";
import { RulesSchema, TILE_VALUES, type MeldType, type Seat, type Tile } from "@rigel/schema";
import { createQuizRng } from "./quiz";
import { payText } from "./score";
import { scoreAgariHand, type AgariContext } from "./score-engine";

/** 点数計算クイズと同じ「切り上げ満貫なし」（7700/11600 を出すため）。 */
const RULES = RulesSchema.parse({ kiriage: false });

/** "234m 55p" 形式を Tile[] へ（テスト記述用）。 */
function tiles(spec: string): Tile[] {
  const out: Tile[] = [];
  for (const part of spec.split(" ")) {
    const suit = part[part.length - 1]!;
    for (const d of part.slice(0, -1)) out.push(`${d}${suit}` as Tile);
  }
  return out;
}

function ctx(input: {
  closed: string | Tile[];
  win: Tile;
  tsumo?: boolean;
  seat?: Seat;
  round?: Seat;
  melds?: { type: MeldType; tiles: string }[];
  dora?: Tile[];
  riichi?: boolean;
}): AgariContext {
  return {
    closedTiles: typeof input.closed === "string" ? tiles(input.closed) : input.closed,
    melds: (input.melds ?? []).map((m) => ({ type: m.type, tiles: tiles(m.tiles) })),
    winTile: input.win,
    tsumo: input.tsumo ?? false,
    seatWind: input.seat ?? "south", // 既定は子
    roundWind: input.round ?? "east",
    doraIndicators: input.dora ?? [],
    riichi: input.riichi,
  };
}

type YakuRow = [string, number];

interface FixedCase {
  name: string;
  c: AgariContext;
  yaku: YakuRow[];
  han: number;
  fu: number;
  total: number;
}

function assertFixed({ c, yaku, han, fu, total }: FixedCase) {
  const r = scoreAgariHand(c, RULES);
  expect(r).not.toBeNull();
  expect(r!.yaku).toEqual(yaku.map(([name, h]) => ({ name, han: h })));
  expect(r!.han).toBe(han);
  expect(r!.fu).toBe(fu);
  expect(r!.score.total).toBe(total);
}

describe("scoreAgariHand: 基本役と符（門前）", () => {
  const cases: FixedCase[] = [
    {
      // 分解: 234m + 55m + 345p + 567p + 456s(4s[5s]6s カンチャン)。
      // 符: 20 + カンチャン2 + 門前ロン10 = 32 → 40。子1翻40符ロン = 1300。
      name: "断幺九のみ・カンチャンロンは40符1300",
      c: ctx({ closed: "234m 55m 345p 567p 456s", win: "5s" }),
      yaku: [["断幺九", 1]],
      han: 1,
      fu: 40,
      total: 1300,
    },
    {
      // 分解: 234m + 789m + 234p + 66p + 345s(45s が 3s/6s 両面)。9m があるので断幺九はつかない。
      // 平和ロンは30符固定。子1翻30符 = 1000。
      name: "平和のみ・門前ロンは30符1000",
      c: ctx({ closed: "234m 789m 234p 66p 345s", win: "3s" }),
      yaku: [["平和", 1]],
      han: 1,
      fu: 30,
      total: 1000,
    },
    {
      // 同じ手のツモ。平和ツモは20符固定（ツモ2符を数えない）。
      // 子2翻20符ツモ = 400/700（合計1500）。
      name: "平和ツモは20符固定（門前清自摸和と複合で1500）",
      c: ctx({ closed: "234m 789m 234p 66p 345s", win: "3s", tsumo: true }),
      yaku: [
        ["門前清自摸和", 1],
        ["平和", 1],
      ],
      han: 2,
      fu: 20,
      total: 1500,
    },
    {
      // 分解: 234m + 789m + 234p + 66p + 456s(カンチャン)。ツモのみ。
      // 符: 20 + カンチャン2 + ツモ2 = 24 → 30。子1翻30符ツモ = 300/500（合計1100）。
      name: "門前清自摸和のみ・カンチャンツモは30符1100",
      c: ctx({ closed: "234m 789m 234p 66p 456s", win: "5s", tsumo: true }),
      yaku: [["門前清自摸和", 1]],
      han: 1,
      fu: 30,
      total: 1100,
    },
    {
      // 分解: 555z(白暗刻) + 234m(両面) + 567p + 789s + 88p。
      // 符: 20 + 白暗刻8 + 門前ロン10 = 38 → 40。子1翻40符 = 1300。
      name: "役牌 白・暗刻8符で40符1300",
      c: ctx({ closed: "555z 234m 567p 789s 88p", win: "4m" }),
      yaku: [["役牌 白", 1]],
      han: 1,
      fu: 40,
      total: 1300,
    },
    {
      // 東場の東家の 111z 刻子は自風+場風で2翻（連風は2つの役牌）。
      // 符: 20 + 1z暗刻8 + 単騎2 + 門前ロン10 = 40。親2翻40符ロン = 3900。
      name: "連風牌の刻子は自風+場風の2翻（親3900）",
      c: ctx({ closed: "111z 345m 678p 234s 55p", win: "5p", seat: "east", round: "east" }),
      yaku: [
        ["自風", 1],
        ["場風", 1],
      ],
      han: 2,
      fu: 40,
      total: 3900,
    },
    {
      // 連風の雀頭は 2+2=4符。分解: 555z(白) + 234m + 567m + 234p(両面) + 11z(連風雀頭)。
      // 符: 20 + 白暗刻8 + 連風雀頭4 + 門前ロン10 = 42 → 50。親1翻50符ロン = 2400。
      name: "連風雀頭は4符（親1翻50符2400）",
      c: ctx({ closed: "555z 234m 567m 234p 11z", win: "4p", seat: "east", round: "east" }),
      yaku: [["役牌 白", 1]],
      han: 1,
      fu: 50,
      total: 2400,
    },
  ];

  it.each(cases)("$name", assertFixed);
});

describe("scoreAgariHand: 役カタログ（2翻〜6翻・喰い下がり・符の詳細）", () => {
  const cases: FixedCase[] = [
    {
      // 分解: 234m+234m(一盃口) + 789p(78[9]p…ではなくカンチャン待ちにするため 8p 和了) + 456s + 99s。
      // 789p の 8p 和了はカンチャン。符: 20 + カンチャン2 + 門前ロン10 = 32 → 40。
      name: "一盃口（門前1翻・カンチャン40符1300）",
      c: ctx({ closed: "223344m 789p 456s 99s", win: "8p" }),
      yaku: [["一盃口", 1]],
      han: 1,
      fu: 40,
      total: 1300,
    },
    {
      // ポン3m + ポン7p + 555s暗刻 + 888s暗刻 + 99m単騎。暗刻は2つなので三暗刻はつかない。
      // 符: 20 + 明刻2+2 + 暗刻4+4 + 単騎2 = 34 → 40。子2翻40符ロン = 2600。
      name: "対々和（鳴き2翻・40符2600）",
      c: ctx({
        closed: "555s 888s 99m",
        win: "9m",
        melds: [
          { type: "pon", tiles: "333m" },
          { type: "pon", tiles: "777p" },
        ],
      }),
      yaku: [["対々和", 2]],
      han: 2,
      fu: 40,
      total: 2600,
    },
    {
      // 222m+333p+444s 暗刻3つ + 567m(両面ロン) + 88p。断幺九と複合。
      // 符: 20 + 暗刻4×3 + 門前ロン10 = 42 → 50。子3翻50符ロン = 6400。
      name: "三暗刻+断幺九（50符6400）",
      c: ctx({ closed: "222m 567m 333p 88p 444s", win: "7m" }),
      yaku: [
        ["断幺九", 1],
        ["三暗刻", 2],
      ],
      han: 3,
      fu: 50,
      total: 6400,
    },
    {
      // 明槓2m + 明槓6s + 暗槓5p + 345m(両面ロン) + 77p。喰いタンあり。
      // 符: 20 + 明槓8+8 + 暗槓16 = 52 → 60。子3翻60符ロン（kiriage:false）= 7700。
      name: "三槓子+断幺九（鳴き・60符7700）",
      c: ctx({
        closed: "345m 77p",
        win: "5m",
        melds: [
          { type: "kan_open", tiles: "2222m" },
          { type: "kan_open", tiles: "6666s" },
          { type: "kan_closed", tiles: "5555p" },
        ],
      }),
      yaku: [
        ["断幺九", 1],
        ["三槓子", 2],
      ],
      han: 3,
      fu: 60,
      total: 7700,
    },
    {
      // ポン1m + ポン9s + 999p暗刻 + 111z暗刻 + 77z(中)単騎。西家・南場で 1z は客風。
      // 符: 20 + 明刻(幺九)4+4 + 暗刻(幺九)8+8 + 中雀頭2 + 単騎2 = 48 → 50。4翻50符 → 満貫8000。
      name: "混老頭+対々和（鳴き4翻・満貫8000）",
      c: ctx({
        closed: "999p 111z 77z",
        win: "7z",
        seat: "west",
        round: "south",
        melds: [
          { type: "pon", tiles: "111m" },
          { type: "pon", tiles: "999s" },
        ],
      }),
      yaku: [
        ["対々和", 2],
        ["混老頭", 2],
      ],
      han: 4,
      fu: 50,
      total: 8000,
    },
    {
      // 555z(白)+666z(發)暗刻 + 77z(中)雀頭 + 234m(両面) + 567s。白+發+小三元 = 4翻。
      // 符: 20 + 白暗刻8 + 發暗刻8 + 中雀頭2 + 門前ロン10 = 48 → 50 → 満貫8000。
      name: "小三元+白+發（満貫8000）",
      c: ctx({ closed: "555z 666z 77z 234m 567s", win: "2m" }),
      yaku: [
        ["役牌 白", 1],
        ["役牌 發", 1],
        ["小三元", 2],
      ],
      han: 4,
      fu: 50,
      total: 8000,
    },
    {
      // 123m + 789p(89 待ち 7 のペンチャンロン) + 789s + 111z暗刻 + 99m。南家・南場で 1z は客風。
      // 符: 20 + 1z暗刻8 + ペンチャン2 + 門前ロン10 = 40。子2翻40符 = 2600。
      name: "混全帯幺九（門前2翻・ペンチャン40符2600）",
      c: ctx({ closed: "123m 789p 789s 111z 99m", win: "7p", round: "south" }),
      yaku: [["混全帯幺九", 2]],
      han: 2,
      fu: 40,
      total: 2600,
    },
    {
      // チー789p で喰い下がり1翻。123m + 789s(両面) + 111z暗刻 + 99m。
      // 符: 20 + 1z暗刻8 = 28 → 30。子1翻30符 = 1000。
      name: "混全帯幺九は喰い下がり1翻（30符1000）",
      c: ctx({
        closed: "123m 789s 111z 99m",
        win: "9s",
        round: "south",
        melds: [{ type: "chi", tiles: "789p" }],
      }),
      yaku: [["混全帯幺九", 1]],
      han: 1,
      fu: 30,
      total: 1000,
    },
    {
      // 123456789m の一気通貫 + 55s/99p のシャンポンで 5s ロン（完成刻子は明刻2符）。
      // 符: 20 + 5s明刻2 + 門前ロン10 = 32 → 40。子2翻40符 = 2600。
      name: "一気通貫+シャンポンロン（40符2600）",
      c: ctx({ closed: "123456789m 555s 99p", win: "5s" }),
      yaku: [["一気通貫", 2]],
      han: 2,
      fu: 40,
      total: 2600,
    },
    {
      // 234 三色 + 平和 + 断幺九 = 4翻30符。kiriage:false で子ロン 7700（オーナー要望値）。
      name: "三色同順+平和+断幺九 = 子4翻30符ロン7700",
      c: ctx({ closed: "234m 678m 234p 55p 234s", win: "8m" }),
      yaku: [
        ["平和", 1],
        ["断幺九", 1],
        ["三色同順", 2],
      ],
      han: 4,
      fu: 30,
      total: 7700,
    },
    {
      // 同じ手を親（東家）で。4翻30符親ロン = 11600（オーナー要望値）。
      name: "同じ4翻30符を親ロンで 11600",
      c: ctx({ closed: "234m 678m 234p 55p 234s", win: "8m", seat: "east" }),
      yaku: [
        ["平和", 1],
        ["断幺九", 1],
        ["三色同順", 2],
      ],
      han: 4,
      fu: 30,
      total: 11600,
    },
    {
      // ポン4m + ポン4p + 444s暗刻の三色同刻 + 567m(両面) + 88s。喰いタンと複合。
      // 符: 20 + 明刻2+2 + 暗刻4 = 28 → 30。子3翻30符 = 3900。
      name: "三色同刻+断幺九（鳴き3翻・30符3900）",
      c: ctx({
        closed: "444s 567m 88s",
        win: "7m",
        melds: [
          { type: "pon", tiles: "444m" },
          { type: "pon", tiles: "444p" },
        ],
      }),
      yaku: [
        ["断幺九", 1],
        ["三色同刻", 2],
      ],
      han: 3,
      fu: 30,
      total: 3900,
    },
    {
      // ロンのシャンポンで完成した刻子は明刻扱い（444m=2符。暗刻4符なら42→50になってしまう）。
      // 分解: 555z(白暗刻8) + 234p + 678s + 444m(ロン明刻2) + 99s。
      // 符: 20 + 8 + 2 + 門前ロン10 = 40（ちょうど40で切り上げなし）。子1翻40符 = 1300。
      name: "ロンで完成する刻子は明刻扱い（40符1300）",
      c: ctx({ closed: "555z 234p 678s 444m 99s", win: "4m" }),
      yaku: [["役牌 白", 1]],
      han: 1,
      fu: 40,
      total: 1300,
    },
    {
      // 同じ手のツモは暗刻扱い（4符）+ ツモ2符: 20+8+4+2 = 34 → 40。
      // 門前清自摸和と複合で2翻40符ツモ = 700/1300（合計2700）。
      name: "ツモで完成する刻子は暗刻扱い（2翻40符2700）",
      c: ctx({ closed: "555z 234p 678s 444m 99s", win: "4m", tsumo: true }),
      yaku: [
        ["門前清自摸和", 1],
        ["役牌 白", 1],
      ],
      han: 2,
      fu: 40,
      total: 2700,
    },
    {
      // 七対子は25符2翻固定。子2翻25符ロン = 1600。
      name: "七対子（25符1600）",
      c: ctx({ closed: "11m 99m 22p 33p 44s 55s 77z", win: "4s" }),
      yaku: [["七対子", 2]],
      han: 2,
      fu: 25,
      total: 1600,
    },
    {
      // 123m+345m+678m+777z(中) + 22z。単色+字牌の門前混一3翻 + 中1翻 = 4翻。
      // 符: 20 + 中暗刻8 + 門前ロン10 = 38 → 40 → 4翻40符は満貫切り詰め 8000。
      name: "混一色（門前3翻）+中で満貫8000",
      c: ctx({ closed: "123m 345m 678m 777z 22z", win: "6m" }),
      yaku: [
        ["役牌 中", 1],
        ["混一色", 3],
      ],
      han: 4,
      fu: 40,
      total: 8000,
    },
    {
      // チー123m で混一色は喰い下がり2翻（オーナー要望の「鳴き混一2翻」）。
      // 符: 20 + 中暗刻8 = 28 → 30。子3翻30符 = 3900。
      name: "混一色は喰い下がり2翻（鳴き3翻30符3900）",
      c: ctx({
        closed: "345m 678m 777z 22z",
        win: "6m",
        melds: [{ type: "chi", tiles: "123m" }],
      }),
      yaku: [
        ["役牌 中", 1],
        ["混一色", 2],
      ],
      han: 3,
      fu: 30,
      total: 3900,
    },
    {
      // 111m暗刻 + 345m + 678m + 999m(シャンポンロン=明刻) + 55m。清一色6翻 = 跳満。
      // 符: 20 + 111m暗刻8 + 999m明刻4 + 門前ロン10 = 42 → 50（跳満なので符は点数に影響しない）。
      name: "清一色（門前6翻・跳満12000）",
      c: ctx({ closed: "111m 345m 678m 999m 55m", win: "9m" }),
      yaku: [["清一色", 6]],
      han: 6,
      fu: 50,
      total: 12000,
    },
    {
      // 同じ手にドラ1（表示2m→ドラ3m×1）で7翻。跳満のまま親18000。
      name: "清一色+ドラ1 = 7翻跳満（親18000）",
      c: ctx({ closed: "111m 345m 678m 999m 55m", win: "9m", seat: "east", dora: ["2m"] }),
      yaku: [
        ["清一色", 6],
        ["ドラ", 1],
      ],
      han: 7,
      fu: 50,
      total: 18000,
    },
    {
      // 暗槓1z（南家・東場 → 場風）+ 111p暗刻 + 234m(カンチャン) + 234s + 88s。
      // 符: 20 + 1z暗槓32 + 111p暗刻8 + カンチャン2 + 門前ロン10 = 72 → 80。
      // 子1翻80符ロン = 2600。
      name: "80符（暗槓+幺九暗刻・場風1翻2600）",
      c: ctx({
        closed: "111p 234m 234s 88s",
        win: "3m",
        melds: [{ type: "kan_closed", tiles: "1111z" }],
      }),
      yaku: [["場風", 1]],
      han: 1,
      fu: 80,
      total: 2600,
    },
    {
      // 暗槓9m + 暗槓1z + 111s暗刻（三暗刻）+ 234p + 33m単騎。西家・南場で 1z は客風。
      // 符: 20 + 暗槓(幺九)32+32 + 暗刻(幺九)8 + 単騎2 + 門前ロン10 = 104 → 110。
      // 子2翻110符ロン = 7100（オーナー要望の110符）。
      name: "110符（幺九暗槓2つ・三暗刻2翻7100）",
      c: ctx({
        closed: "111s 234p 33m",
        win: "3m",
        seat: "west",
        round: "south",
        melds: [
          { type: "kan_closed", tiles: "9999m" },
          { type: "kan_closed", tiles: "1111z" },
        ],
      }),
      yaku: [["三暗刻", 2]],
      han: 2,
      fu: 110,
      total: 7100,
    },
    {
      // 清一+一盃口+平和 = 8翻倍満。分解: 234m+234m+567m(両面ロン)+789m+99m。
      name: "清一色+一盃口+平和 = 倍満（子16000）",
      c: ctx({ closed: "223344m 567m 789m 99m", win: "7m" }),
      yaku: [
        ["平和", 1],
        ["一盃口", 1],
        ["清一色", 6],
      ],
      han: 8,
      fu: 30,
      total: 16000,
    },
    {
      // 同じ倍満を親ロンで 24000。
      name: "倍満の親ロンは24000",
      c: ctx({ closed: "223344m 567m 789m 99m", win: "7m", seat: "east" }),
      yaku: [
        ["平和", 1],
        ["一盃口", 1],
        ["清一色", 6],
      ],
      han: 8,
      fu: 30,
      total: 24000,
    },
    {
      // 2233445566 7788s: 高点法で 平和+断幺+二盃口+清一 = 11翻三倍満（七対子8翻ではなく）。
      name: "三倍満（11翻・子24000）",
      c: ctx({ closed: "22334455667788s", win: "8s" }),
      yaku: [
        ["平和", 1],
        ["断幺九", 1],
        ["二盃口", 3],
        ["清一色", 6],
      ],
      han: 11,
      fu: 30,
      total: 24000,
    },
    {
      // 同じ11翻を親ロンで 36000。
      name: "三倍満の親ロンは36000",
      c: ctx({ closed: "22334455667788s", win: "8s", seat: "east" }),
      yaku: [
        ["平和", 1],
        ["断幺九", 1],
        ["二盃口", 3],
        ["清一色", 6],
      ],
      han: 11,
      fu: 30,
      total: 36000,
    },
    {
      // ドラ・赤ドラは行として加算（表示3m→ドラ4m×2、赤5m×1）。平和+断幺+ドラ2+赤1 = 5翻満貫。
      name: "ドラ・赤ドラの行（平和+断幺+ドラ2+赤1 = 満貫8000）",
      c: ctx({
        closed: [
          "2m",
          "3m",
          "4m",
          "4m",
          "0m",
          "6m",
          "2p",
          "3p",
          "4p",
          "5s",
          "5s",
          "6s",
          "7s",
          "8s",
        ],
        win: "8s",
        dora: ["3m"],
      }),
      yaku: [
        ["平和", 1],
        ["断幺九", 1],
        ["ドラ", 2],
        ["赤ドラ", 1],
      ],
      han: 5,
      fu: 30,
      total: 8000,
    },
  ];

  it.each(cases)("$name", assertFixed);

  it("喰いタンは rules.kuitan に従う（true=30符1000 / false=無役 null）", () => {
    // チー234m + 345p(両面ロン) + 567s + 678s + 88p。素点20符 → 喰い平和形ロンは30符。
    const c = ctx({
      closed: "345p 567s 678s 88p",
      win: "5p",
      melds: [{ type: "chi", tiles: "234m" }],
    });
    const r = scoreAgariHand(c, RULES);
    expect(r).not.toBeNull();
    expect(r!.yaku).toEqual([{ name: "断幺九", han: 1 }]);
    expect(r!.fu).toBe(30);
    expect(r!.score.total).toBe(1000);
    expect(scoreAgariHand(c, RulesSchema.parse({ kiriage: false, kuitan: false }))).toBeNull();
  });

  it("数え役満: 13翻は kazoe on で役満32000 / off（既定=Mリーグ相当）で三倍満24000", () => {
    // 三倍満の手 + ドラ2（表示1s→ドラ2s×2）で13翻。
    const c = ctx({ closed: "22334455667788s", win: "8s", dora: ["1s"] });
    const on = scoreAgariHand(c, RulesSchema.parse({ kiriage: false, kazoe: true }));
    expect(on!.han).toBe(13);
    expect(on!.score).toMatchObject({ total: 32000, limit: "役満" });
    const off = scoreAgariHand(c, RULES);
    expect(off!.score).toMatchObject({ total: 24000, limit: "三倍満" });
  });

  it("Mリーグ既定（kiriage:true）なら3翻60符は切り上げ満貫8000", () => {
    const c = ctx({
      closed: "345m 77p",
      win: "5m",
      melds: [
        { type: "kan_open", tiles: "2222m" },
        { type: "kan_open", tiles: "6666s" },
        { type: "kan_closed", tiles: "5555p" },
      ],
    });
    expect(scoreAgariHand(c, RulesSchema.parse({}))!.score).toMatchObject({
      total: 8000,
      limit: "満貫",
    });
  });

  it.each([
    { ind: "9m" as Tile, want: 2, note: "数牌は9→1循環（ドラ1m）" },
    { ind: "2s" as Tile, want: 2, note: "順当な次位（ドラ3s）" },
    { ind: "4z" as Tile, want: 1, note: "風牌は北→東循環（ドラ1z: 手に無し）" },
    { ind: "7z" as Tile, want: 1, note: "三元牌は中→白循環（ドラ5z: 手に無し）" },
  ])("ドラ表示牌の次位: $note", ({ ind, want }) => {
    // 平和のみの手（1m を含む）: 123m + 789m + 234p + 66p + 345s(両面ロン)。
    const r = scoreAgariHand(
      ctx({ closed: "123m 789m 234p 66p 345s", win: "3s", dora: [ind] }),
      RULES,
    );
    expect(r!.han).toBe(want);
  });
});

// quiz.ts v1（意図した分解ベースの scoreHandFu/scoreHandHan）の固定ケースのうち、
// エンジン側に無かったものをここへ付け替える（v2 統合 2026-07-26。符内訳は手検算）。
describe("scoreAgariHand: v1 固定ケースの付け替え（親子の支払い・大明槓・100符）", () => {
  it("親ツモは「◯点オール」（ダブ東暗刻+門前ツモ 3翻30符 = 2000点オール）", () => {
    // 分解: 111z(ダブ東暗刻8) + 345m + 456p + 567s(両面) + 88p。符 = 20+8+2(ツモ) = 30。
    // 翻 = 自風1+場風1+門前清自摸和1 = 3。親ツモ3翻30符 = 2000オール（合計6000）。
    const r = scoreAgariHand(
      ctx({ closed: "111z 345m 456p 567s 88p", win: "7s", tsumo: true, seat: "east" }),
      RULES,
    );
    expect(r!.yaku).toEqual([
      { name: "門前清自摸和", han: 1 },
      { name: "自風", han: 1 },
      { name: "場風", han: 1 },
    ]);
    expect(r!.han).toBe(3);
    expect(r!.fu).toBe(30);
    expect(r!.score.payment).toEqual({ each: 2000 });
    expect(payText(r!.score)).toBe("2000点オール");
  });

  it("子ツモは「子◯ / 親◯」（大明槓のみ・門前ツモ翻なし 1翻40符 = 子400 / 親700）", () => {
    // 分解: 中の大明槓(么九明槓16・門前喪失) + 234m(両面) + 567p + 456s + 88s。
    // 符 = 20 + 16 + 2(ツモ) = 38 → 40。翻 = 中1のみ（門前でないので門前清自摸和なし）。
    const c = ctx({
      closed: "234m 567p 456s 88s",
      win: "4m",
      tsumo: true,
      melds: [{ type: "kan_open", tiles: "7777z" }],
    });
    const r = scoreAgariHand(c, RULES);
    expect(r!.yaku).toEqual([{ name: "役牌 中", han: 1 }]);
    expect(r!.fu).toBe(40);
    expect(payText(r!.score)).toBe("子400 / 親700");
  });

  it("大明槓は門前ロン+10 も付かない（同手のロンは 1翻40符 = 1300点）", () => {
    // 符 = 20 + 16 = 36 → 40（門前ロン10が付けば 46→50 になってしまう）。
    const r = scoreAgariHand(
      ctx({
        closed: "234m 567p 456s 88s",
        win: "4m",
        melds: [{ type: "kan_open", tiles: "7777z" }],
      }),
      RULES,
    );
    expect(r!.fu).toBe(40);
    expect(payText(r!.score)).toBe("1300点");
  });

  it("100符（么九暗槓2組: 白+9p・役牌白 1翻 = 3200点）", () => {
    // 符 = 20 + 10(門前ロン。暗槓は門前を壊さない) + 32 + 32 = 94 → 100。
    // 子1翻100符ロン = 800×4 = 3200。
    const r = scoreAgariHand(
      ctx({
        closed: "234m 567s 66p",
        win: "4m",
        melds: [
          { type: "kan_closed", tiles: "5555z" },
          { type: "kan_closed", tiles: "9999p" },
        ],
      }),
      RULES,
    );
    expect(r!.yaku).toEqual([{ name: "役牌 白", han: 1 }]);
    expect(r!.han).toBe(1);
    expect(r!.fu).toBe(100);
    expect(payText(r!.score)).toBe("3200点");
  });
});

// リーチ（[決定] 2026-07-26 スコープ追加）: 立直は1翻・門前のみ。一発・裏ドラは従来どおり対象外。
describe("scoreAgariHand: リーチ（立直1翻・門前のみ・一発/裏ドラなし）", () => {
  const cases: FixedCase[] = [
    {
      // 分解: 234m + 789m + 234p + 66p + 456s(4s[5s]6s カンチャン)。リーチなしなら無役ロンの手。
      // 立直だけで有役になる。符: 20 + カンチャン2 + 門前ロン10 = 32 → 40。子1翻40符 = 1300。
      name: "立直のみ（他役なしでも有役・40符1300）",
      c: ctx({ closed: "234m 789m 234p 66p 456s", win: "5s", riichi: true }),
      yaku: [["立直", 1]],
      han: 1,
      fu: 40,
      total: 1300,
    },
    {
      // 同じ手のツモ。立直+門前清自摸和の2翻。符: 20 + カンチャン2 + ツモ2 = 24 → 30。
      // 子2翻30符ツモ = 500/1000（合計2000）。
      name: "立直+ツモは門前清自摸和と複合で2翻（30符2000）",
      c: ctx({ closed: "234m 789m 234p 66p 456s", win: "5s", tsumo: true, riichi: true }),
      yaku: [
        ["立直", 1],
        ["門前清自摸和", 1],
      ],
      han: 2,
      fu: 30,
      total: 2000,
    },
    {
      // 暗槓（kan_closed）は門前を壊さないのでリーチ可。暗槓1z（南家・東場 → 場風）+ 111p暗刻 +
      // 234m(カンチャン) + 234s + 88s。符: 20 + 1z暗槓32 + 111p暗刻8 + カンチャン2 + 門前ロン10 = 72 → 80。
      // 立直+場風の2翻80符ロン = 5200。
      name: "暗槓のみの手はリーチ可（立直+場風 2翻80符5200）",
      c: ctx({
        closed: "111p 234m 234s 88s",
        win: "3m",
        melds: [{ type: "kan_closed", tiles: "1111z" }],
        riichi: true,
      }),
      yaku: [
        ["立直", 1],
        ["場風", 1],
      ],
      han: 2,
      fu: 80,
      total: 5200,
    },
    {
      // 七対子とも複合する（立直1+七対子2 = 3翻25符）。子3翻25符ロン = 3200。
      name: "立直+七対子（3翻25符3200）",
      c: ctx({ closed: "11m 99m 22p 33p 44s 55s 77z", win: "4s", riichi: true }),
      yaku: [
        ["立直", 1],
        ["七対子", 2],
      ],
      han: 3,
      fu: 25,
      total: 3200,
    },
  ];

  it.each(cases)("$name", assertFixed);

  // 晒し（pon/chi/kan_open/kan_added）がある手の riichi=true は矛盾した入力 → null（防御）。
  it.each([
    {
      name: "チー入り",
      c: ctx({
        closed: "345p 567s 678s 88p",
        win: "5p",
        melds: [{ type: "chi", tiles: "234m" }],
        riichi: true,
      }),
    },
    {
      name: "ポン入り",
      c: ctx({
        closed: "555s 888s 99m",
        win: "9m",
        melds: [
          { type: "pon", tiles: "333m" },
          { type: "pon", tiles: "777p" },
        ],
        riichi: true,
      }),
    },
    {
      name: "明槓入り",
      c: ctx({
        closed: "234m 567p 456s 88s",
        win: "4m",
        melds: [{ type: "kan_open", tiles: "7777z" }],
        riichi: true,
      }),
    },
  ])("晒しあり（$name）+ riichi=true は不正入力として null", ({ c }) => {
    expect(scoreAgariHand(c, RULES)).toBeNull();
  });
});

describe("scoreAgariHand: 高点法", () => {
  it("① 二盃口(3翻40符5200) を七対子(2翻25符1600) より優先する", () => {
    const r = scoreAgariHand(ctx({ closed: "223344m 556677p 99s", win: "9s" }), RULES);
    expect(r!.yaku).toEqual([{ name: "二盃口", han: 3 }]);
    expect(r!.han).toBe(3);
    expect(r!.fu).toBe(40);
    expect(r!.score.total).toBe(5200);
  });

  it("② 平和ツモ2翻20符(1500) をカンチャンツモ1翻30符(1100) より優先する", () => {
    // 344556s は {345+456} の一意分解だが、和了牌4sの所属が 345(カンチャン)/456(両面) の2解釈。
    const r = scoreAgariHand(
      ctx({ closed: "344556s 234m 789p 88p", win: "4s", tsumo: true }),
      RULES,
    );
    expect(r!.yaku).toEqual([
      { name: "門前清自摸和", han: 1 },
      { name: "平和", han: 1 },
    ]);
    expect(r!.fu).toBe(20);
    expect(r!.score.total).toBe(1500);
    expect(r!.score.payment).toEqual({ fromDealer: 700, fromNonDealer: 400 });
  });

  it("③ 分解の競合: 111222333p はツモなら三暗刻解釈(5200)を一盃口解釈(2000)より優先する", () => {
    // ※三色と一通が同時に成立して見える手は14枚では構成できない（両役の必要牌が15枚以上）
    //   ため、分解競合の代表として刻子解釈 vs 順子解釈を焼き付ける。
    // A: {111,222,333}p + 456s + 99p 雀頭。2p ツモで 222 完成 → 暗刻3つ = 三暗刻+ツモ 3翻40符。
    // B: {123,123,123}p → 一盃口+ツモ 2翻30符。A の方が高い。
    const r = scoreAgariHand(ctx({ closed: "111222333p 99p 456s", win: "2p", tsumo: true }), RULES);
    expect(r!.yaku).toEqual([
      { name: "門前清自摸和", han: 1 },
      { name: "三暗刻", han: 2 },
    ]);
    expect(r!.fu).toBe(40);
    expect(r!.score.total).toBe(5200);
  });

  it("③' 同じ手のロン(3p)は刻子解釈が無役になり一盃口解釈(1300)を返す", () => {
    // A: 333p がロン明刻になり三暗刻が消えて無役。B: 一盃口+ペンチャン(12待ち3)で 1翻40符。
    const r = scoreAgariHand(ctx({ closed: "111222333p 99p 456s", win: "3p" }), RULES);
    expect(r!.yaku).toEqual([{ name: "一盃口", han: 1 }]);
    expect(r!.fu).toBe(40);
    expect(r!.score.total).toBe(1300);
  });

  it("④ 和了牌の所属で符が変わる（両面=平和30符 / カンチャン解釈は無役）", () => {
    const r = scoreAgariHand(ctx({ closed: "344556s 234m 789p 88p", win: "4s" }), RULES);
    expect(r!.yaku).toEqual([{ name: "平和", han: 1 }]);
    expect(r!.fu).toBe(30);
    expect(r!.score.total).toBe(1000);
  });
});

describe("scoreAgariHand: 役満", () => {
  interface YakumanCase {
    name: string;
    c: AgariContext;
    yaku: string[];
    total: number;
  }
  const cases: YakumanCase[] = [
    {
      // 白發中の刻子3つ。ドラ表示1m（ドラ2m は手にあるが役満時は数えない）。
      // 役牌（白發中）の行も出さない（役満時は他の役を数えない）。
      name: "大三元（子ロン32000・ドラ行なし）",
      c: ctx({ closed: "555z 666z 777z 234m 88s", win: "4m", dora: ["1m"] }),
      yaku: ["大三元"],
      total: 32000,
    },
    {
      // 222m/333p/555s/777s の4暗刻（7s ツモで完成する刻子は暗刻扱い）+ 44m。
      name: "四暗刻（子ツモ32000）",
      c: ctx({ closed: "222m 333p 555s 777s 44m", win: "7s", tsumo: true }),
      yaku: ["四暗刻"],
      total: 32000,
    },
    {
      name: "字一色（子ロン32000）",
      c: ctx({ closed: "222z 333z 444z 55z 666z", win: "6z" }),
      yaku: ["字一色"],
      total: 32000,
    },
    {
      name: "緑一色（子ロン32000）",
      c: ctx({ closed: "223344s 666s 88s 666z", win: "4s" }),
      yaku: ["緑一色"],
      total: 32000,
    },
    {
      name: "清老頭（子ロン32000）",
      c: ctx({
        closed: "111m 999m 999s 11s",
        win: "1s",
        melds: [{ type: "pon", tiles: "111p" }],
      }),
      yaku: ["清老頭"],
      total: 32000,
    },
    {
      name: "四槓子（子ロン32000）",
      c: ctx({
        closed: "99m",
        win: "9m",
        melds: [
          { type: "kan_open", tiles: "2222m" },
          { type: "kan_added", tiles: "5555p" },
          { type: "kan_closed", tiles: "3333s" },
          { type: "kan_open", tiles: "7777p" },
        ],
      }),
      yaku: ["四槓子"],
      total: 32000,
    },
    {
      name: "小四喜（子ロン32000）",
      c: ctx({ closed: "111z 222z 333z 44z 567m", win: "7m" }),
      yaku: ["小四喜"],
      total: 32000,
    },
    {
      // 大四喜はシングル役満扱い（ダブル役満バリアントは将来対応）。
      name: "大四喜（子ロン32000）",
      c: ctx({
        closed: "111z 222z 333z 55m",
        win: "5m",
        melds: [{ type: "pon", tiles: "444z" }],
      }),
      yaku: ["大四喜"],
      total: 32000,
    },
    {
      name: "国士無双（子ロン32000）",
      c: ctx({
        closed: [
          "1m",
          "9m",
          "1p",
          "9p",
          "1s",
          "9s",
          "1z",
          "2z",
          "3z",
          "4z",
          "5z",
          "6z",
          "7z",
          "1m",
        ],
        win: "1m",
      }),
      yaku: ["国士無双"],
      total: 32000,
    },
    {
      // 1112345678999m + 5m。清一色は数えない（役満のみ）。
      name: "九蓮宝燈（子ロン32000）",
      c: ctx({ closed: "1112345678999m 5m", win: "5m" }),
      yaku: ["九蓮宝燈"],
      total: 32000,
    },
    {
      // 役満の複合は multiYakuman（既定 on）で倍加する（score.ts と同じ扱い）。
      // 風4刻子 + 中単騎ロン（単騎は刻子を明刻にしないので四暗刻も成立）= トリプル 96000。
      name: "役満の複合（字一色+四暗刻+大四喜 = トリプル96000）",
      c: ctx({ closed: "111z 222z 333z 444z 77z", win: "7z" }),
      yaku: ["字一色", "四暗刻", "大四喜"],
      total: 96000,
    },
  ];

  it.each(cases)("$name", ({ c, yaku, total }) => {
    const r = scoreAgariHand(c, RULES);
    expect(r).not.toBeNull();
    expect(r!.yaku).toEqual(yaku.map((name) => ({ name, han: 13 })));
    expect(r!.han).toBe(13 * yaku.length);
    expect(r!.score.total).toBe(total);
    expect(r!.score.limit).toContain("役満");
  });

  it("四暗刻はロンだと明刻が混ざり、対々和+三暗刻+断幺九の満貫になる", () => {
    const r = scoreAgariHand(
      ctx({ closed: "222m 333p 555s 777s 44m", win: "7s" }), // ツモでなくロン
      RULES,
    );
    expect(r!.yaku).toEqual([
      { name: "断幺九", han: 1 },
      { name: "対々和", han: 2 },
      { name: "三暗刻", han: 2 },
    ]);
    expect(r!.score).toMatchObject({ total: 8000, limit: "満貫" });
  });

  it("親の役満ロンは48000", () => {
    const r = scoreAgariHand(
      ctx({ closed: "555z 666z 777z 234m 88s", win: "4m", seat: "east" }),
      RULES,
    );
    expect(r!.score.total).toBe(48000);
  });
});

describe("scoreAgariHand: 無役・不正入力は null", () => {
  const nulls: { name: string; c: AgariContext }[] = [
    {
      // 門前ロン・役なし（平和形でもカンチャンなので平和不成立）。
      name: "無役ロンは null",
      c: ctx({ closed: "234m 789m 234p 66p 456s", win: "5s" }),
    },
    {
      name: "和了牌が門前部分に無ければ null",
      c: ctx({ closed: "234m 789m 234p 66p 345s", win: "1z" }),
    },
    {
      name: "枚数が 3n+2 相当でなければ null（13枚）",
      c: ctx({ closed: "234m 789m 234p 66p 45s", win: "4s" }),
    },
    {
      name: "和了形でなければ null（バラバラの14枚）",
      c: ctx({ closed: "129m 258p 367s 1234z 55z", win: "5z" }),
    },
  ];

  it.each(nulls)("$name", ({ c }) => {
    expect(scoreAgariHand(c, RULES)).toBeNull();
  });
});

describe("scoreAgariHand: 性質テスト（シード固定のランダム和了形100手）", () => {
  // 牌種インデックス（0-8=萬 9-17=筒 18-26=索 27-33=字）→ 牌コード。赤5は含めない。
  const KINDS: readonly Tile[] = TILE_VALUES.filter((t) => t[0] !== "0");
  const SEATS: readonly Seat[] = ["east", "south", "west", "north"];

  /** 雀頭+面子4つのランダム和了形（門前14枚）を組む。同一牌5枚以上は組み直す。 */
  function randomAgari(rng: () => number): AgariContext {
    for (;;) {
      const counts = new Array<number>(34).fill(0);
      const kinds: number[] = [];
      const pair = Math.floor(rng() * 34);
      counts[pair] += 2;
      kinds.push(pair, pair);
      let ok = true;
      for (let b = 0; b < 4; b++) {
        if (rng() < 0.6) {
          const start = Math.floor(rng() * 3) * 9 + Math.floor(rng() * 7);
          for (const i of [start, start + 1, start + 2]) {
            counts[i]!++;
            kinds.push(i);
          }
        } else {
          const i = Math.floor(rng() * 34);
          counts[i]! += 3;
          kinds.push(i, i, i);
        }
      }
      if (counts.some((n) => n > 4)) ok = false;
      if (!ok) continue;
      const tiles = kinds.map((i) => KINDS[i]!);
      return {
        closedTiles: tiles,
        melds: [],
        winTile: tiles[Math.floor(rng() * tiles.length)]!,
        tsumo: rng() < 0.5,
        seatWind: SEATS[Math.floor(rng() * 4)]!,
        roundWind: rng() < 0.5 ? "east" : "south",
        doraIndicators: rng() < 0.5 ? [KINDS[Math.floor(rng() * 34)]!] : [],
      };
    }
  }

  it("非null なら han>=1・fu は10刻み(25除く)・han=行の合計・役満時にドラ行がない", () => {
    const rng = createQuizRng(20260726);
    const rules = RulesSchema.parse({});
    let scored = 0;
    for (let n = 0; n < 100; n++) {
      const c = randomAgari(rng);
      const r = scoreAgariHand(c, rules);
      if (r === null) continue; // 無役ロンなど（null は正当な白旗）
      scored++;
      expect(r.han).toBeGreaterThanOrEqual(1);
      expect(r.fu === 25 || r.fu % 10 === 0).toBe(true);
      expect(r.yaku.length).toBeGreaterThan(0);
      expect(r.yaku.reduce((s, y) => s + y.han, 0)).toBe(r.han);
      expect(r.score.total).toBeGreaterThan(0);
      if (r.yaku.some((y) => y.han >= 13)) {
        // 役満: 全行が役満で、ドラ・赤ドラ・通常役の行は無い。
        expect(r.yaku.every((y) => y.han === 13)).toBe(true);
        expect(r.yaku.some((y) => y.name === "ドラ" || y.name === "赤ドラ")).toBe(false);
      }
    }
    // 性質テストが空振りしていないこと（シード固定なので決定的）。
    expect(scored).toBeGreaterThan(30);
  });
});
