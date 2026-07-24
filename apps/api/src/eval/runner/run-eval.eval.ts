// ============================================================
// eval runner 入口 — 実 Gemini で eval-fixtures を読む（手動実行専用）
// ------------------------------------------------------------
// 実行:  pnpm --filter api eval
// 鍵:    apps/api/.dev.vars（GEMINI_API_KEY。無ければ環境変数）
//        CLOUDFLARE_AI_GATEWAY_URL 未設定なら Google AI Studio 直で呼ぶ。
// 実行ループ本体は run-cases.ts（フェイククライアントでテスト済み）。
// ============================================================

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { describe, expect, it } from "vitest";
import { HttpGeminiClient } from "../../infrastructure/gemini/gemini-client";
import { DEFAULT_HAND_MODEL, DEFAULT_RIVER_MODEL } from "../../infrastructure/gemini/models";
import { parseDotEnv } from "../dotenv";
import { runEvalCases } from "./run-cases";

const CASES_DIR = "eval-fixtures/cases";
// vitest がコンソールを飲み込む環境でも結果が残るよう、レポートはファイルにも書く（git 管理外）。
const REPORT_PATH = "eval-fixtures/last-report.txt";

function loadEnv(): Record<string, string | undefined> {
  const fromFile = existsSync(".dev.vars") ? parseDotEnv(readFileSync(".dev.vars", "utf8")) : {};
  return { ...fromFile, ...process.env };
}

describe("AI読み取り精度 eval（実 Gemini・手動実行）", () => {
  it("eval-fixtures の全ターゲットを読み、レポートとドラフトを出す", async () => {
    const env = loadEnv();
    const apiKey = env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GEMINI_API_KEY がありません（apps/api/.dev.vars か環境変数に設定してください）",
      );
    }
    const baseUrl = env.CLOUDFLARE_AI_GATEWAY_URL || "https://generativelanguage.googleapis.com";
    const riverModel = env.GEMINI_RIVER_MODEL || DEFAULT_RIVER_MODEL;
    const handModel = env.GEMINI_HAND_MODEL || DEFAULT_HAND_MODEL;
    // Agentic Vision A/B 用（GEMINI_CODE_EXECUTION=1 で有効化）。
    const codeExecution = env.GEMINI_CODE_EXECUTION === "1";

    const lines: string[] = [];
    const log = (line: string) => {
      lines.push(line);
      console.log(line);
    };
    log(
      `eval: 経路=${baseUrl.includes("googleapis.com") ? "Google直" : "AI Gateway"}` +
        ` / 河=${riverModel} / 手牌=${handModel}` +
        `${codeExecution ? " / AgenticVision" : ""} / ${new Date().toISOString()}`,
    );

    const summary = await runEvalCases({
      casesDir: CASES_DIR,
      client: new HttpGeminiClient({ apiKey, baseUrl, codeExecution }),
      riverModel,
      handModel,
      log,
    });
    writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);

    expect(summary.errors, summary.errors.join("\n")).toEqual([]);
    expect(summary.drafted).toBeGreaterThan(0);
  });
});
