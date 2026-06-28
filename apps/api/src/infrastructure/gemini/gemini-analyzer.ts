// infrastructure/gemini — Analyzer の実装（Gemini + AI Gateway）。
// 【M5 で実装】4分割→正立→Gemini→Zod検証→相対絶対変換→Kifu組み立て。
// モデル名はハードコードせず env / AI Studio の現行モデルを使う。

import type { Kifu } from "@rigel/schema";
import type { AnalysisInput, Analyzer } from "../../domain/kifu/analyzer";

export class GeminiAnalyzer implements Analyzer {
  analyze(input: AnalysisInput): Promise<Kifu> {
    void input;
    return Promise.reject(new Error("GeminiAnalyzer は未実装です（M5: 解析パイプライン）"));
  }
}
