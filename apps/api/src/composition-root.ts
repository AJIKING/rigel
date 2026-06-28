// ============================================================
// composition-root — 依存の組み立て（DIの単一窓口）
// ------------------------------------------------------------
// Env(バインディング) から、infrastructure の実体を生成し、application の
// ユースケースへ注入する。ここだけが「具体」を知る。interfaces 層はここで
// 組み立てた AppContainer 経由でユースケースを呼ぶ。
// ============================================================

import { AnalyzeAndSaveKifu } from "./application/analyze-and-save-kifu.usecase";
import { AuthenticateWithGoogle } from "./application/authenticate-with-google.usecase";
import { GetGameWithLogs } from "./application/get-game-with-logs.usecase";
import { GetKifu } from "./application/get-kifu.usecase";
import { GetUser } from "./application/get-user.usecase";
import { ListGames } from "./application/list-games.usecase";
import { ListKifu } from "./application/list-kifu.usecase";
import type { SessionService } from "./domain/auth/session";
import type { Env } from "./env";
import { JoseGoogleTokenVerifier } from "./infrastructure/auth/jose-google-token-verifier";
import { JwtSessionService } from "./infrastructure/auth/jwt-session-service";
import { DrizzleAnalysisStore } from "./infrastructure/analysis/drizzle-analysis-store";
import { createDb } from "./infrastructure/db/client";
import { DrizzleGameRepository } from "./infrastructure/game/drizzle-game.repository";
import { GeminiAnalyzer } from "./infrastructure/gemini/gemini-analyzer";
import { HttpGeminiClient } from "./infrastructure/gemini/gemini-client";
import { HAND_PROMPT_SINGLE } from "./infrastructure/gemini/hand-prompt";
import { ImageRiverPreprocessor } from "./infrastructure/gemini/image-river-preprocessor";
import { PhotonImageProcessor } from "./infrastructure/gemini/photon-image-processor";
import { RIVER_PROMPT_SINGLE } from "./infrastructure/gemini/river-prompt";
import { DrizzleGameLogRepository } from "./infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleUserRepository } from "./infrastructure/user/drizzle-user.repository";

export interface AppContainer {
  analyzeAndSaveKifu: AnalyzeAndSaveKifu;
  getKifu: GetKifu;
  listKifu: ListKifu;
  listGames: ListGames;
  getGameWithLogs: GetGameWithLogs;
  authenticateWithGoogle: AuthenticateWithGoogle;
  getUser: GetUser;
  /** 認証ミドルウェアが Bearer トークン検証に使う。 */
  session: SessionService;
}

/** 既定モデル。⚠️ AI Studio で現行の対応モデルを確認して env で上書きする。 */
const DEFAULT_RIVER_MODEL = "gemini-2.5-flash"; // 河=難所
const DEFAULT_HAND_MODEL = "gemini-2.5-flash-lite"; // 手牌=素直なタスク

export function buildContainer(env: Env): AppContainer {
  const db = createDb(env.DB);
  const users = new DrizzleUserRepository(db);
  const gameLogs = new DrizzleGameLogRepository(db);
  const gamesRepo = new DrizzleGameRepository(db);

  // 副作用（時刻・ID生成）の供給は1か所に集約してユースケースへ注入する。
  const now = () => new Date();
  const newId = () => crypto.randomUUID();

  const analyzer = new GeminiAnalyzer({
    client: new HttpGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.CLOUDFLARE_AI_GATEWAY_URL,
    }),
    // 河1枚 → 4分割＋正立（Photon/WASM）。
    preprocessor: new ImageRiverPreprocessor(new PhotonImageProcessor()),
    riverPrompt: RIVER_PROMPT_SINGLE,
    riverModel: env.GEMINI_RIVER_MODEL ?? DEFAULT_RIVER_MODEL,
    handPrompt: HAND_PROMPT_SINGLE,
    handModel: env.GEMINI_HAND_MODEL ?? DEFAULT_HAND_MODEL,
    now,
  });

  const session = new JwtSessionService({ secret: env.SESSION_SECRET });

  return {
    analyzeAndSaveKifu: new AnalyzeAndSaveKifu({
      users,
      games: gamesRepo,
      gameLogs,
      analyzer,
      store: new DrizzleAnalysisStore(db),
      now,
      newId,
    }),
    getKifu: new GetKifu(gameLogs),
    listKifu: new ListKifu(gameLogs),
    listGames: new ListGames(gamesRepo),
    getGameWithLogs: new GetGameWithLogs(gamesRepo, gameLogs),
    authenticateWithGoogle: new AuthenticateWithGoogle({
      users,
      verifier: new JoseGoogleTokenVerifier(env.GOOGLE_CLIENT_ID),
      session,
      now,
      newId,
    }),
    getUser: new GetUser(users),
    session,
  };
}
