import { describe, expect, it } from "vitest";
import {
  applyFavoriteOverrides,
  toggleFavoriteOverride,
  type FavoriteOverrides,
} from "./favorites";

/** カード1枚（id / お気に入り数 / 自分が付けたか）。 */
function card(id: string, favoriteCount: number, viewerFaved: boolean) {
  return { id, favoriteCount, viewerFaved };
}

const EMPTY: FavoriteOverrides = new Map();

describe("applyFavoriteOverrides（サーバーの値に画面の操作を重ねる）", () => {
  it("操作が無ければカードをそのまま返す", () => {
    const cards = [card("a", 3, false)];
    expect(applyFavoriteOverrides(cards, EMPTY)).toEqual(cards);
  });

  it("操作のあるカードだけ viewerFaved と favoriteCount を差し替える", () => {
    const cards = [card("a", 3, false), card("b", 9, true)];
    const o = toggleFavoriteOverride(EMPTY, cards[0]!);
    expect(applyFavoriteOverrides(cards, o)).toEqual([card("a", 4, true), card("b", 9, true)]);
  });

  it("件数は 0 未満にしない（他端末で先に外された等でサーバー値が古いとき）", () => {
    const cards = [card("a", 0, true)];
    const o = toggleFavoriteOverride(EMPTY, cards[0]!);
    expect(applyFavoriteOverrides(cards, o)).toEqual([card("a", 0, false)]);
  });

  it("カード以外のフィールドは保つ（一覧カードをそのまま流せる）", () => {
    const cards = [{ ...card("a", 1, false), title: "半荘" }];
    expect(applyFavoriteOverrides(cards, toggleFavoriteOverride(EMPTY, cards[0]!))[0]).toEqual({
      id: "a",
      favoriteCount: 2,
      viewerFaved: true,
      title: "半荘",
    });
  });
});

describe("toggleFavoriteOverride（付け外しの重ね合わせ）", () => {
  it("入力の Map を変更しない（新しい Map を返す）", () => {
    const cards = [card("a", 3, false)];
    const next = toggleFavoriteOverride(EMPTY, cards[0]!);
    expect(EMPTY.size).toBe(0);
    expect(next.size).toBe(1);
  });

  it("2回押すとサーバーの値に戻る（差分 0 で打ち消す）", () => {
    const c = card("a", 3, false);
    const twice = toggleFavoriteOverride(toggleFavoriteOverride(EMPTY, c), c);
    expect(applyFavoriteOverrides([c], twice)).toEqual([card("a", 3, false)]);
  });

  it("3回押すと1回押しと同じ（押した回数の偶奇で決まる）", () => {
    const c = card("a", 3, false);
    let o = EMPTY;
    for (let i = 0; i < 3; i++) o = toggleFavoriteOverride(o, c);
    expect(applyFavoriteOverrides([c], o)).toEqual([card("a", 4, true)]);
  });

  it("付いているカードを押すと外れ、件数が1減る", () => {
    const c = card("a", 5, true);
    expect(applyFavoriteOverrides([c], toggleFavoriteOverride(EMPTY, c))).toEqual([
      card("a", 4, false),
    ]);
  });

  it("次に送るべきサーバーの状態（faved）を返す", () => {
    const c = card("a", 3, false);
    expect(toggleFavoriteOverride(EMPTY, c).get("a")!.faved).toBe(true);
    expect(toggleFavoriteOverride(toggleFavoriteOverride(EMPTY, c), c).get("a")!.faved).toBe(false);
  });
});

describe("rollbackFavoriteOverride（サーバー失敗時に押す前へ戻す）", () => {
  it("押す前が「操作なし」ならキーごと消す", async () => {
    const { rollbackFavoriteOverride } = await import("./favorites");
    const c = card("a", 3, false);
    const after = toggleFavoriteOverride(EMPTY, c);
    expect(rollbackFavoriteOverride(after, "a", EMPTY.get("a")).size).toBe(0);
  });

  it("押す前に操作があったならその状態へ戻す", async () => {
    const { rollbackFavoriteOverride } = await import("./favorites");
    const c = card("a", 3, false);
    const once = toggleFavoriteOverride(EMPTY, c);
    const twice = toggleFavoriteOverride(once, c);
    const back = rollbackFavoriteOverride(twice, "a", once.get("a"));
    expect(applyFavoriteOverrides([c], back)).toEqual([card("a", 4, true)]);
  });
});
