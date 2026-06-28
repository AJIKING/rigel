// ============================================================
// composition-root — 依存の組み立て（DIの単一窓口）
// ------------------------------------------------------------
// Env(バインディング) から、infrastructure の実体を生成し、application の
// ユースケースへ注入する。ここだけが「具体」を知る。interfaces 層はここで
// 組み立てた AppContainer 経由でユースケースを呼ぶ。
// ============================================================

import { AnalyzeAndSaveKifu } from "./application/analyze-and-save-kifu.usecase";
import { GetKifu } from "./application/get-kifu.usecase";
import { ListKifu } from "./application/list-kifu.usecase";
import type { Env } from "./env";
import { createDb } from "./infrastructure/db/client";
import { GeminiAnalyzer } from "./infrastructure/gemini/gemini-analyzer";
import { HttpGeminiClient } from "./infrastructure/gemini/gemini-client";
import { RIVER_PROMPT_SINGLE } from "./infrastructure/gemini/river-prompt";
import { UnimplementedRiverPreprocessor } from "./infrastructure/gemini/river-preprocessor";
import { DrizzleGameLogRepository } from "./infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleUserRepository } from "./infrastructure/user/drizzle-user.repository";

export interface AppContainer {
  analyzeAndSaveKifu: AnalyzeAndSaveKifu;
  getKifu: GetKifu;
  listKifu: ListKifu;
}

/** 河読み取りの既定モデル。⚠️ AI Studio で現行の対応モデルを確認して env で上書きする。 */
const DEFAULT_RIVER_MODEL = "gemini-2.5-flash";

export function buildContainer(env: Env): AppContainer {
  const db = createDb(env.DB);
  const users = new DrizzleUserRepository(db);
  const gameLogs = new DrizzleGameLogRepository(db);

  const analyzer = new GeminiAnalyzer({
    client: new HttpGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.CLOUDFLARE_AI_GATEWAY_URL,
    }),
    // 河の4分割＋正立は image processing 待ち（M5b）。今は呼ぶと明示的に失敗する。
    preprocessor: new UnimplementedRiverPreprocessor(),
    riverPrompt: RIVER_PROMPT_SINGLE,
    riverModel: env.GEMINI_RIVER_MODEL ?? DEFAULT_RIVER_MODEL,
    now: () => new Date(),
  });

  return {
    analyzeAndSaveKifu: new AnalyzeAndSaveKifu({
      users,
      gameLogs,
      analyzer,
      now: () => new Date(),
      newId: () => crypto.randomUUID(),
    }),
    getKifu: new GetKifu(gameLogs),
    listKifu: new ListKifu(gameLogs),
  };
}
