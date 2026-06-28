// infrastructure/gemini — モデル応答テキストから JSON を取り出す。
// Agentic Vision / Code Execution 使用時、最終テキストにコードフェンスや前置きが
// 混じることがある（設計ドキュメント 4章 [未確定]）。種類でパーツを仕分けた後の
// テキストに対して、頑健に JSON を抽出する。

/** 最初に現れる釣り合った `{...}` または `[...]` を返す（文字列リテラル内の括弧は無視）。 */
function firstBalanced(s: string): string | null {
  const start = s.search(/[{[]/);
  if (start < 0) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * モデル応答テキストから JSON 値を抽出してパースする。
 * 1) ```json フェンス内、2) 最初の釣り合った括弧、3) 全文 の順に試す。
 * どれもパースできなければ例外。
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());

  const balanced = firstBalanced(trimmed);
  if (balanced) candidates.push(balanced);

  candidates.push(trimmed);

  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // 次の候補を試す
    }
  }
  throw new Error("Gemini 応答から JSON を抽出できませんでした");
}
