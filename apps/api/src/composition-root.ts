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
import { DrizzleGameLogRepository } from "./infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleUserRepository } from "./infrastructure/user/drizzle-user.repository";

export interface AppContainer {
  analyzeAndSaveKifu: AnalyzeAndSaveKifu;
  getKifu: GetKifu;
  listKifu: ListKifu;
}

export function buildContainer(env: Env): AppContainer {
  const db = createDb(env.DB);
  const users = new DrizzleUserRepository(db);
  const gameLogs = new DrizzleGameLogRepository(db);
  const analyzer = new GeminiAnalyzer();

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
