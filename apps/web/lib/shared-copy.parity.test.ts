// @rigel/ui は「web/mobile で同一であるべき文言・読み上げ名」の単一真実源。その契約を守る検査。
//
// パリティ（web/mobile の挙動一致）で実害が出たのは見た目ではなく **意味の差** だった
// （同じ操作の失敗文言が違う / 片方だけ案内が出ない / ★の読み上げ名が違う）。定数を共有しても、
// アプリ側に同じ文字列をベタ書きすれば静かに乖離する。ここでは「ui が持っている文言が、
// アプリのソースに文字列リテラルとして再登場していないか」を見て、次のドリフトを止める。
//
// なぜ apps/web に置くか: ソースを読むので node の型が要るが、packages/ui は
// tsconfig.base の `types: []`（環境型ゼロ＝プラットフォーム非依存）が規律で、そこに
// @types/node を足したくない。node 型を持つ唯一の vitest 環境がここなので間借りする。
// **検査対象は web と mobile の両方**（この置き場所は技術的な都合にすぎない）。
//
// 限界（承知の上）: 文字列リテラルだけを見る。JSX のテキストノード（<Text>解析中</Text>）は
// 拾えない。短い語（「公開」「削除」等）も対象外＝誤検知を避けるため一定長以上に絞る。

import * as ui from "@rigel/ui";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** 共有文言とみなす最短長（これ未満は「公開」「削除」等の一般語で誤検知が多い）。 */
const MIN_LENGTH = 8;

/** 日本語を含むか（enum 値・キー・URL などの機械的な文字列を除くため）。 */
function hasJapanese(s: string): boolean {
  return /[぀-ヿ一-龯]/.test(s);
}

/** リポジトリのルート（vitest の cwd は apps/web）。 */
const REPO_ROOT = join(process.cwd(), "..", "..");

const SCAN_TARGETS = [join("apps", "web"), join("apps", "mobile")];

/** 走査から外すディレクトリ（生成物・依存・撮影/検証用フィクスチャ）。 */
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".open-next",
  ".expo",
  "android",
  "ios",
  "dist",
  "build",
  "e2e",
  "shots",
  "dev", // app/dev/* は目視検証用フィクスチャ
]);

/** 走査から外すファイル（テストとフィクスチャは文言を直接書いてよい）。 */
function isSkippedFile(name: string): boolean {
  return (
    !/\.(ts|tsx)$/.test(name) ||
    /\.test\.(ts|tsx)$/.test(name) ||
    name.endsWith("test-helpers.ts") ||
    name.endsWith("test-support.ts")
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(p, out);
    } else if (!isSkippedFile(entry)) {
      out.push(p);
    }
  }
  return out;
}

/** ui の export から文言（string）を再帰的に集める。関数の戻り値は取れない（定数のみが対象）。 */
function collectSharedCopy(): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      // 文言だけを対象にする（"published" 等の enum 値・キーは日本語を含まないので外れる）。
      if (v.length >= MIN_LENGTH && hasJapanese(v)) out.add(v);
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v && typeof v === "object") {
      Object.values(v).forEach(visit);
    }
  };
  visit(ui);
  return out;
}

/** ソース中の文字列リテラル（"..." / '...' / `...`）を取り出す。 */
function stringLiterals(source: string): { text: string; line: number }[] {
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.)*)`/g;
  const out: { text: string; line: number }[] = [];
  for (const m of source.matchAll(re)) {
    const text = m[1] ?? m[2] ?? m[3];
    if (!text) continue;
    out.push({ text, line: source.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** ソースから「共有文言のベタ書き」を探す（検知ロジック本体。単体テストできるよう切り出す）。 */
function findHardcodedCopy(
  source: string,
  shared: ReadonlySet<string>,
): { text: string; line: number }[] {
  return stringLiterals(source).filter(({ text }) => shared.has(text));
}

describe("共有文言の単一真実源（@rigel/ui にある文言をアプリでベタ書きしない）", () => {
  const shared = collectSharedCopy();

  it("検査対象の共有文言が十分に集まっている（収集器が壊れていない）", () => {
    expect(shared.size).toBeGreaterThan(20);
    // 代表例（パリティで一本化したもの）が含まれること。
    expect(shared.has(ui.ANALYSIS_BUSY_MESSAGE)).toBe(true);
    expect(shared.has(ui.LIST_LOAD_ERROR_MESSAGE)).toBe(true);
    // enum 値・キーは文言ではないので対象外（誤検知の防止）。
    expect(shared.has("published")).toBe(false);
  });

  it("検知ロジック: ベタ書きは見つけ、定数経由の参照とコメントは見逃す", () => {
    const set = new Set([ui.ANALYSIS_BUSY_MESSAGE]);
    // ベタ書き（違反）。
    expect(findHardcodedCopy(`setError("${ui.ANALYSIS_BUSY_MESSAGE}");`, set)).toHaveLength(1);
    // 定数を使う（正しい書き方）。
    expect(findHardcodedCopy(`setError(ANALYSIS_BUSY_MESSAGE);`, set)).toEqual([]);
    // 引用符を含まないコメントは対象外（「…」での引用は日常的なので誤検知にしない）。
    expect(findHardcodedCopy(`// 文言は「${ui.ANALYSIS_BUSY_MESSAGE}」`, set)).toEqual([]);
  });

  it("apps/web・apps/mobile の本番コードに、ui の共有文言と同一のリテラルが無い", () => {
    const violations: string[] = [];
    for (const target of SCAN_TARGETS) {
      for (const file of walk(join(REPO_ROOT, target))) {
        const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
        for (const { text, line } of findHardcodedCopy(readFileSync(file, "utf8"), shared)) {
          violations.push(`${rel}:${line} 「${text}」`);
        }
      }
    }
    expect(
      violations,
      `@rigel/ui の共有文言がベタ書きされています（定数を import して使う）:\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
