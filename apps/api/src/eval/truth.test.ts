import { describe, expect, it } from "vitest";
import {
  formatHandDraft,
  formatRiverTokens,
  parseTileToken,
  parseTruthFile,
  resolveTargetImage,
} from "./truth";

describe("parseTileToken（正解ラベルの牌トークン）", () => {
  it("通常の牌コードを読む", () => {
    expect(parseTileToken("5s")).toEqual({ tile: "5s", riichi: false });
    expect(parseTileToken("7z")).toEqual({ tile: "7z", riichi: false });
    expect(parseTileToken("0p")).toEqual({ tile: "0p", riichi: false });
  });

  it("* 接頭辞はリーチ宣言牌（横向き）", () => {
    expect(parseTileToken("*5s")).toEqual({ tile: "5s", riichi: true });
  });

  it("? は人間でも判別不能（tile: null が正解）", () => {
    expect(parseTileToken("?")).toEqual({ tile: null, riichi: false });
    expect(parseTileToken("*?")).toEqual({ tile: null, riichi: true });
  });

  it("不正な牌コードは理由つきで弾く", () => {
    expect(() => parseTileToken("5x")).toThrow(/5x/);
    expect(() => parseTileToken("10m")).toThrow(/10m/);
    expect(() => parseTileToken("")).toThrow();
  });
});

describe("parseTruthFile（truth.json の検証）", () => {
  const riverFile = {
    source: "メモ",
    targets: [
      { kind: "river", player: "bottom", discards: ["1z", "*5s", "?"] },
      { kind: "river", player: "right", discards: [] },
    ],
  };

  it("river ターゲットを読み、トークンを展開する", () => {
    const file = parseTruthFile(riverFile);
    const t = file.targets[0];
    if (t.kind !== "river") throw new Error("river のはず");
    expect(t.player).toBe("bottom");
    expect(t.discards).toEqual([
      { tile: "1z", riichi: false },
      { tile: "5s", riichi: true },
      { tile: null, riichi: false },
    ]);
  });

  it("hand ターゲット（鳴きつき）を読む", () => {
    const file = parseTruthFile({
      targets: [
        {
          kind: "hand",
          player: "bottom",
          hand: ["1m", "?"],
          melds: [{ type: "pon", tiles: ["5z", "5z", "5z"], from: "left" }],
        },
      ],
    });
    const t = file.targets[0];
    if (t.kind !== "hand") throw new Error("hand のはず");
    expect(t.hand).toEqual([
      { tile: "1m", riichi: false },
      { tile: null, riichi: false },
    ]);
    expect(t.melds[0]).toEqual({
      type: "pon",
      tiles: [
        { tile: "5z", riichi: false },
        { tile: "5z", riichi: false },
        { tile: "5z", riichi: false },
      ],
      from: "left",
    });
  });

  it("暗槓の from は null を許す", () => {
    const file = parseTruthFile({
      targets: [
        {
          kind: "hand",
          player: "bottom",
          hand: [],
          melds: [{ type: "kan_closed", tiles: ["1z", "1z", "1z", "1z"], from: null }],
        },
      ],
    });
    const t = file.targets[0];
    if (t.kind !== "hand") throw new Error("hand のはず");
    expect(t.melds[0].from).toBeNull();
  });

  it("不正な牌トークンはどのターゲットかわかるエラーで弾く", () => {
    expect(() =>
      parseTruthFile({
        targets: [{ kind: "river", player: "top", discards: ["1z", "8x"] }],
      }),
    ).toThrow(/8x/);
  });

  it("truth.json として形が壊れていれば弾く", () => {
    expect(() => parseTruthFile({ targets: [{ kind: "river" }] })).toThrow();
    expect(() => parseTruthFile(null)).toThrow();
  });
});

describe("resolveTargetImage（ターゲットが読む画像パスの解決）", () => {
  it("image 指定があればそれを使う", () => {
    const file = parseTruthFile({
      targets: [{ kind: "river", player: "bottom", image: "crops/custom.png", discards: [] }],
    });
    expect(resolveTargetImage(file, file.targets[0])).toBe("crops/custom.png");
  });

  it("単一ターゲットなら source.png", () => {
    const file = parseTruthFile({
      targets: [{ kind: "hand", player: "bottom", hand: [], melds: [] }],
    });
    expect(resolveTargetImage(file, file.targets[0])).toBe("source.png");
  });

  it("複数ターゲットなら crops/<player>.png", () => {
    const file = parseTruthFile({
      targets: [
        { kind: "river", player: "bottom", discards: [] },
        { kind: "river", player: "top", discards: [] },
      ],
    });
    expect(resolveTargetImage(file, file.targets[1])).toBe("crops/top.png");
  });
});

describe("ドラフト整形（AI応答 → truth.json に貼れるトークン）", () => {
  it("河: リーチは * 接頭辞、null は ?", () => {
    expect(
      formatRiverTokens({
        discards: [
          { order: 1, tile: "1z", riichi: false, tsumogiri: false },
          { order: 2, tile: "5s", riichi: true, tsumogiri: false },
          { order: 3, tile: null, riichi: false, tsumogiri: false },
        ],
        notes: "",
      }),
    ).toEqual(["1z", "*5s", "?"]);
  });

  it("河: order 順に並べ直してから整形する", () => {
    expect(
      formatRiverTokens({
        discards: [
          { order: 2, tile: "5s", riichi: false, tsumogiri: false },
          { order: 1, tile: "1z", riichi: false, tsumogiri: false },
        ],
        notes: "",
      }),
    ).toEqual(["1z", "5s"]);
  });

  it("手牌: hand と melds をトークン化する", () => {
    expect(
      formatHandDraft({
        hand: [{ tile: "1m" }, { tile: null }],
        melds: [
          {
            type: "pon",
            tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
            from: "left",
          },
        ],
        notes: "",
      }),
    ).toEqual({
      hand: ["1m", "?"],
      melds: [{ type: "pon", tiles: ["5z", "5z", "5z"], from: "left" }],
    });
  });
});
