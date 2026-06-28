import { describe, expect, it } from "vitest";
import { extractJson } from "./extract-json";

describe("extractJson", () => {
  it("素の JSON をパースする", () => {
    expect(extractJson('{"discards":[],"notes":""}')).toEqual({ discards: [], notes: "" });
  });

  it("```json フェンスの中身を取り出す", () => {
    const text = 'ここに結果です:\n```json\n{"a":1}\n```\nおわり';
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("前置きテキスト + JSON（混在パーツの最終テキスト）から取り出す", () => {
    const text =
      'I cropped and read the river. Final answer: {"discards":[{"order":1,"tile":"9p"}]}';
    expect(extractJson(text)).toEqual({ discards: [{ order: 1, tile: "9p" }] });
  });

  it("文字列リテラル内の括弧に惑わされない", () => {
    expect(extractJson('{"notes":"glare on the } right side"}')).toEqual({
      notes: "glare on the } right side",
    });
  });

  it("JSON が無ければ例外", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});
