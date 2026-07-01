import { describe, it, expect } from "vitest";
import {
  AiRiverResponseSchema,
  KifuSchema,
  ReadTileSchema,
  RULE_PRESETS,
  SeatSchema,
  toAbsoluteSeat,
  type CameraSeat,
  type Seat,
} from "./index";

describe("ReadTileSchema（牌＋確信度）", () => {
  it("confidence を省略すると 1.0 になる", () => {
    expect(ReadTileSchema.parse({ tile: "1m" })).toEqual({ tile: "1m", confidence: 1 });
  });

  it("読めなかった牌は null を許容する", () => {
    expect(ReadTileSchema.parse({ tile: null, confidence: 0 }).tile).toBeNull();
  });
});

describe("AiRiverResponseSchema（河1方向のAI出力検証）", () => {
  it("不正な牌コードを拒否する", () => {
    const result = AiRiverResponseSchema.safeParse({
      discards: [{ order: 1, tile: "10m" }],
    });
    expect(result.success).toBe(false);
  });

  it("null スロットを保持しても枚数・順序が壊れない（推測で埋めない）", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [
        { order: 1, tile: null, confidence: 0 },
        { order: 2, tile: "9p" },
      ],
    });
    expect(result.discards).toHaveLength(2);
    expect(result.discards[0]).toMatchObject({ order: 1, tile: null });
    // riichi / confidence のデフォルトが効く
    expect(result.discards[1]).toMatchObject({
      order: 2,
      tile: "9p",
      riichi: false,
      confidence: 1,
    });
  });

  it("横向き牌は riichi:true で表せる", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [{ order: 1, tile: "3z", riichi: true }],
    });
    expect(result.discards[0]?.riichi).toBe(true);
  });

  it("捨て方は tsumogiri で表す（既定は手出し=false）", () => {
    const result = AiRiverResponseSchema.parse({
      discards: [
        { order: 1, tile: "1m" },
        { order: 2, tile: "2p", tsumogiri: true },
      ],
    });
    expect(result.discards[0]?.tsumogiri).toBe(false); // 既定=手出し
    expect(result.discards[1]?.tsumogiri).toBe(true); // 自摸切り
  });
});

describe("KifuSchema（牌譜1件の最終検証）", () => {
  const minimalKifu = {
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
  };

  it("最小構成の牌譜を受理し、各席に空の盤面デフォルトが入る", () => {
    const kifu = KifuSchema.parse(minimalKifu);
    expect(kifu.seats.east).toEqual({ hand: [], melds: [], river: [] });
    expect(kifu.result).toBeNull();
  });

  it("schemaVersion が一致しないと拒否する", () => {
    const result = KifuSchema.safeParse({ ...minimalKifu, schemaVersion: "9.9.9" });
    expect(result.success).toBe(false);
  });

  it("局メタ(本場/供託/ドラ/裏ドラ/最終巡目)は省略時に既定が入る（後方互換）", () => {
    const kifu = KifuSchema.parse(minimalKifu);
    expect(kifu.meta).toMatchObject({
      honba: 0,
      kyotaku: 0,
      dora: null,
      uraDora: null,
      junme: 1,
    });
  });

  it("局メタを指定すると保持する（記録のみ・点数計算はしない）", () => {
    const kifu = KifuSchema.parse({
      ...minimalKifu,
      meta: { honba: 2, kyotaku: 1, dora: "3p", uraDora: "5m", junme: 9 },
    });
    expect(kifu.meta).toMatchObject({ honba: 2, kyotaku: 1, dora: "3p", uraDora: "5m", junme: 9 });
  });

  it("本場・供託は負値を、最終巡目は0以下を拒否する", () => {
    expect(KifuSchema.safeParse({ ...minimalKifu, meta: { honba: -1 } }).success).toBe(false);
    expect(KifuSchema.safeParse({ ...minimalKifu, meta: { kyotaku: -1 } }).success).toBe(false);
    expect(KifuSchema.safeParse({ ...minimalKifu, meta: { junme: 0 } }).success).toBe(false);
  });

  it("ドラ表示牌は不正な牌コードを拒否する", () => {
    expect(KifuSchema.safeParse({ ...minimalKifu, meta: { dora: "10m" } }).success).toBe(false);
  });

  it("半荘ルールは省略時に既定（Mリーグ相当）が入る（後方互換）", () => {
    const kifu = KifuSchema.parse(minimalKifu);
    expect(kifu.rules).toEqual(RULE_PRESETS.mleague);
  });

  it("半荘ルールを指定すると保持する", () => {
    const kifu = KifuSchema.parse({
      ...minimalKifu,
      rules: { kuitan: false, aka: "2", uma: "10-20", tobi: true },
    });
    expect(kifu.rules).toMatchObject({ kuitan: false, aka: "2", uma: "10-20", tobi: true });
  });

  it("不正なルール値（ウマ/赤ドラ）を拒否する", () => {
    expect(KifuSchema.safeParse({ ...minimalKifu, rules: { uma: "99-99" } }).success).toBe(false);
    expect(KifuSchema.safeParse({ ...minimalKifu, rules: { aka: "3" } }).success).toBe(false);
  });

  it("和了情報(agari)は省略時 空配列（後方互換）", () => {
    expect(KifuSchema.parse(minimalKifu).agari).toEqual([]);
  });

  it("旧データの単一 agari オブジェクトは配列へ移行する（後方互換）", () => {
    const kifu = KifuSchema.parse({
      ...minimalKifu,
      agari: { winner: "east", from: "south", winTile: "3m", fu: 40, dora: 2 },
    });
    expect(kifu.agari).toHaveLength(1);
    expect(kifu.agari[0]).toMatchObject({ winner: "east", from: "south", winTile: "3m", fu: 40 });
  });

  it("ダブロン（和了2件）を保持する", () => {
    const kifu = KifuSchema.parse({
      ...minimalKifu,
      agari: [
        { winner: "east", from: "south", yaku: [{ name: "立直", han: 1 }] },
        { winner: "west", from: "south", fu: 30 },
      ],
    });
    expect(kifu.agari).toHaveLength(2);
    expect(kifu.agari[0]?.winner).toBe("east");
    expect(kifu.agari[1]?.winner).toBe("west");
  });

  it("和了者(winner)が無いと拒否する", () => {
    expect(KifuSchema.safeParse({ ...minimalKifu, agari: [{ fu: 30 }] }).success).toBe(false);
  });

  it("旧牌譜（rules/agari/裏ドラ 無し）を parse すると新フィールドに既定が入る（後方互換）", () => {
    const legacy = {
      schemaVersion: "1.0.0",
      capturedAt: "2026-06-28T00:00:00.000Z",
      result: "ron",
      cameraBottomSeat: "east",
      seats: { east: { hand: [], melds: [], river: [] }, south: {}, west: {}, north: {} },
      meta: { dealer: "east", honba: 1 },
    };
    const kifu = KifuSchema.parse(legacy);
    expect(kifu.rules).toEqual(RULE_PRESETS.mleague);
    expect(kifu.agari).toEqual([]);
    expect(kifu.meta).toMatchObject({ uraDora: null, kyotaku: 0, dora: null, junme: 1, honba: 1 });
  });
});

describe("RULE_PRESETS（ルールプリセット）", () => {
  it("mleague / tenhou / free の3種を提供する", () => {
    expect(Object.keys(RULE_PRESETS)).toEqual(["mleague", "tenhou", "free"]);
  });

  it("天鳳は途中流局あり・トビ終了あり、Mリーグはどちらも無し", () => {
    expect(RULE_PRESETS.tenhou).toMatchObject({ ryukyoku: true, tobi: true });
    expect(RULE_PRESETS.mleague).toMatchObject({ ryukyoku: false, tobi: false });
  });

  it("Mリーグはダブロン無し(頭ハネ)、天鳳/フリーはダブロンあり", () => {
    expect(RULE_PRESETS.mleague.doubleRon).toBe(false);
    expect(RULE_PRESETS.tenhou.doubleRon).toBe(true);
    expect(RULE_PRESETS.free.doubleRon).toBe(true);
  });
});

describe("toAbsoluteSeat（カメラ相対→絶対席）", () => {
  const cameras: CameraSeat[] = ["bottom", "right", "top", "left"];
  const seats: Seat[] = SeatSchema.options;

  it.each(seats)("bottom は撮影時の手前席(%s)そのもの", (bottom) => {
    expect(toAbsoluteSeat("bottom", bottom)).toBe(bottom);
  });

  it.each(seats)("手前が %s のとき4方向は4席への全単射（重複なし）", (bottom) => {
    const mapped = cameras.map((c) => toAbsoluteSeat(c, bottom));
    expect(new Set(mapped).size).toBe(4);
  });

  // ⚠️【未確定／要実機検証】right/top/left → 南/西/北 の具体的な対応は CAMERA_ORDER の
  // 回転方向に依存する。東家を手前に置いた実写真で目視確認してから期待値を確定し、ここを埋める。
  // 確定するまで具体値を焼き付けない（自分たちの開発ガイドの規律）。
  it.todo("手前=東のとき right/top/left が 南/西/北 に対応する（実機確認後に確定）");
});
