// 一覧ページングのカーソル（背骨）。encode/decode と検証を全一覧 API が共有する
// （Plan: docs/plans/list-pagination.md 3-1。不正カーソルは usecase が invalid=400 に落とす）。

import { describe, expect, it } from "vitest";
import { decodeListCursor, encodeListCursor } from "./list-cursor";

describe("encodeListCursor / decodeListCursor（往復）", () => {
  it("ms と id を不透明文字列に往復できる", () => {
    const c = { ms: 1_753_900_000_123, id: "abc-123" };
    expect(decodeListCursor(encodeListCursor(c))).toEqual(c);
  });

  it("id にアンダースコアが含まれても壊れない（先頭の区切りだけ使う）", () => {
    const c = { ms: 42, id: "problem_draft_1" };
    expect(decodeListCursor(encodeListCursor(c))).toEqual(c);
  });

  it("id にコロン複合キー（favorites の targetType:targetId）を入れられる", () => {
    const c = { ms: 42, id: "problem:550e8400-e29b-41d4-a716-446655440000" };
    expect(decodeListCursor(encodeListCursor(c))).toEqual(c);
  });

  it("境界値も往復する（サーバが発行したカーソルは必ず decode できる不変条件）", () => {
    // id 80文字ちょうど（上限）・ms=1（正の最小）。
    const edge = { ms: 1, id: "a".repeat(80) };
    expect(decodeListCursor(encodeListCursor(edge))).toEqual(edge);
  });
});

describe("decodeListCursor（不正入力は null＝呼び出し側で 400 にする）", () => {
  it.each([
    { name: "空文字", raw: "" },
    { name: "区切りなし", raw: "12345" },
    { name: "ms が数値でない", raw: "abc_id" },
    { name: "ms が負", raw: "-1_id" },
    { name: "ms が小数", raw: "1.5_id" },
    { name: "id が空", raw: "123_" },
    { name: "先頭が区切り", raw: "_id" },
    { name: "id が長すぎる（81文字）", raw: `123_${"a".repeat(81)}` },
  ])("$name → null", ({ raw }) => {
    expect(decodeListCursor(raw)).toBeNull();
  });
});
