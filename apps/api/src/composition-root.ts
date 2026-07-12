// ============================================================
// composition-root — 依存の組み立て（DIの単一窓口）
// ------------------------------------------------------------
// Env(バインディング) から、infrastructure の実体を生成し、application の
// ユースケースへ注入する。ここだけが「具体」を知る。interfaces 層はここで
// 組み立てた AppContainer 経由でユースケースを呼ぶ。
// ============================================================

import { AnalyzeAndSaveKifu } from "./application/analyze-and-save-kifu.usecase";
import { AuthenticateWithGoogle } from "./application/authenticate-with-google.usecase";
import { CreateEmptyKifu } from "./application/create-empty-kifu.usecase";
import { DeleteGame } from "./application/delete-game.usecase";
import { DeleteKifu } from "./application/delete-kifu.usecase";
import { UpdateGame } from "./application/update-game.usecase";
import { UpdateGameRules } from "./application/update-game-rules.usecase";
import { UpdateGamePlayers } from "./application/update-game-players.usecase";
import { UpdateGameStatus } from "./application/update-game-status.usecase";
import { UpdateGameVisibility } from "./application/update-game-visibility.usecase";
import { GetGameWithLogs } from "./application/get-game-with-logs.usecase";
import { GetKifu } from "./application/get-kifu.usecase";
import { GetPublicGameDetail } from "./application/get-public-game-detail.usecase";
import { GetUser } from "./application/get-user.usecase";
import { HandleBillingWebhook } from "./application/handle-billing-webhook.usecase";
import { HandleRevenueCatWebhook } from "./application/handle-revenuecat-webhook.usecase";
import { OpenBillingPortal } from "./application/open-billing-portal.usecase";
import { ListGames } from "./application/list-games.usecase";
import { ListMyGamesWithCounts, ListPublicGames } from "./application/list-game-cards.usecase";
import { DeleteAccount, GetPublicProfile, UpdateProfile } from "./application/profile.usecase";
import { ListKifu } from "./application/list-kifu.usecase";
import { AnswerProblem, GetProblemStats } from "./application/problem-answer.usecase";
import {
  CreateProblem,
  DeleteProblem,
  GetProblem,
  ListMyProblems,
  ListPublishedProblems,
  UpdateProblem,
} from "./application/problem.usecase";
import { StartCheckout } from "./application/start-checkout.usecase";
import { UpdateKifu } from "./application/update-kifu.usecase";
import type { SessionService } from "./domain/auth/session";
import type { Env } from "./env";
import { JoseGoogleTokenVerifier } from "./infrastructure/auth/jose-google-token-verifier";
import { JwtSessionService } from "./infrastructure/auth/jwt-session-service";
import { DrizzleRevenueCatEventRepository } from "./infrastructure/billing/drizzle-revenuecat-event.repository";
import { HttpRevenueCatGateway } from "./infrastructure/billing/http-revenuecat-gateway";
import { StripeBillingGateway } from "./infrastructure/billing/stripe-billing-gateway";
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
import { DrizzleProblemAnswerRepository } from "./infrastructure/problem/drizzle-problem-answer.repository";
import { DrizzleProblemRepository } from "./infrastructure/problem/drizzle-problem.repository";
import { DrizzleAccountStore } from "./infrastructure/user/drizzle-account-store";
import { DrizzleUserRepository } from "./infrastructure/user/drizzle-user.repository";

export interface AppContainer {
  analyzeAndSaveKifu: AnalyzeAndSaveKifu;
  getKifu: GetKifu;
  listKifu: ListKifu;
  updateKifu: UpdateKifu;
  deleteKifu: DeleteKifu;
  deleteGame: DeleteGame;
  updateGame: UpdateGame;
  updateGameRules: UpdateGameRules;
  updateGamePlayers: UpdateGamePlayers;
  updateGameVisibility: UpdateGameVisibility;
  updateGameStatus: UpdateGameStatus;
  createEmptyKifu: CreateEmptyKifu;
  listGames: ListGames;
  listMyGamesWithCounts: ListMyGamesWithCounts;
  listPublicGames: ListPublicGames;
  getGameWithLogs: GetGameWithLogs;
  getPublicGameDetail: GetPublicGameDetail;
  authenticateWithGoogle: AuthenticateWithGoogle;
  getUser: GetUser;
  updateProfile: UpdateProfile;
  getPublicProfile: GetPublicProfile;
  deleteAccount: DeleteAccount;
  createProblem: CreateProblem;
  updateProblem: UpdateProblem;
  deleteProblem: DeleteProblem;
  getProblem: GetProblem;
  listMyProblems: ListMyProblems;
  listPublishedProblems: ListPublishedProblems;
  answerProblem: AnswerProblem;
  getProblemStats: GetProblemStats;
  startCheckout: StartCheckout;
  openBillingPortal: OpenBillingPortal;
  handleBillingWebhook: HandleBillingWebhook;
  handleRevenueCatWebhook: HandleRevenueCatWebhook;
  /** Stripe 鍵が揃っているか。未設定なら課金ルートは 501 を返す。 */
  billingEnabled: boolean;
  /** RevenueCat Webhook の設定が揃っているか。未設定なら受け口は 501 を返す。 */
  revenueCatEnabled: boolean;
  /** RevenueCat Webhook の Authorization ヘッダ照合値（共有シークレット）。 */
  revenueCatWebhookAuth: string;
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
  const problems = new DrizzleProblemRepository(db);
  const problemAnswers = new DrizzleProblemAnswerRepository(db);

  // 副作用（時刻・ID生成）の供給は1か所に集約してユースケースへ注入する。
  const now = () => new Date();
  const newId = () => crypto.randomUUID();
  // 初回プロフィールのランダム handle（Google 情報は使わない）。英数字・11文字で HANDLE_RE を満たす。
  const randomHandle = () => "u" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);

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

  const billing = new StripeBillingGateway({
    secretKey: env.STRIPE_SECRET_KEY ?? "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
    priceNext: env.STRIPE_PRICE_NEXT ?? "",
    pricePro: env.STRIPE_PRICE_PRO ?? "",
  });
  const billingEnabled = Boolean(
    env.STRIPE_SECRET_KEY &&
    env.STRIPE_WEBHOOK_SECRET &&
    env.STRIPE_PRICE_NEXT &&
    env.STRIPE_PRICE_PRO,
  );

  // RevenueCat（エンタイトルメントの真実源。web=Stripe / アプリ=IAP を横串で一元管理）。
  // アプリの IAP（StoreKit / Play Billing）は RevenueCat SDK が吸収し、Webhook で届く。
  const revenueCatWebhookAuth = env.REVENUECAT_WEBHOOK_AUTH ?? "";
  const revenueCatEnabled = Boolean(revenueCatWebhookAuth);
  const revenueCatGateway = env.REVENUECAT_STRIPE_PUBLIC_KEY
    ? new HttpRevenueCatGateway({ stripePublicKey: env.REVENUECAT_STRIPE_PUBLIC_KEY })
    : null;

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
    updateKifu: new UpdateKifu(gameLogs),
    deleteKifu: new DeleteKifu(gameLogs),
    deleteGame: new DeleteGame(gamesRepo, gameLogs),
    updateGame: new UpdateGame(gamesRepo),
    updateGameRules: new UpdateGameRules(gamesRepo, gameLogs),
    updateGamePlayers: new UpdateGamePlayers(gamesRepo, gameLogs),
    updateGameVisibility: new UpdateGameVisibility(gamesRepo, gameLogs, users),
    updateGameStatus: new UpdateGameStatus(gamesRepo, gameLogs, users),
    createEmptyKifu: new CreateEmptyKifu({ games: gamesRepo, gameLogs, users, now, newId }),
    listGames: new ListGames(gamesRepo),
    listMyGamesWithCounts: new ListMyGamesWithCounts(gamesRepo, gameLogs),
    listPublicGames: new ListPublicGames(gamesRepo, gameLogs, users),
    getGameWithLogs: new GetGameWithLogs(gamesRepo, gameLogs),
    getPublicGameDetail: new GetPublicGameDetail(gamesRepo, gameLogs, users),
    authenticateWithGoogle: new AuthenticateWithGoogle({
      users,
      verifier: new JoseGoogleTokenVerifier(env.GOOGLE_CLIENT_ID),
      session,
      now,
      newId,
      randomHandle,
    }),
    getUser: new GetUser(users),
    updateProfile: new UpdateProfile(users),
    getPublicProfile: new GetPublicProfile(users, gamesRepo, gameLogs),
    deleteAccount: new DeleteAccount(users, new DrizzleAccountStore(db)),
    createProblem: new CreateProblem({ problems, users, now, newId }),
    updateProblem: new UpdateProblem(problems),
    deleteProblem: new DeleteProblem(problems, problemAnswers),
    getProblem: new GetProblem(problems),
    listMyProblems: new ListMyProblems(problems),
    listPublishedProblems: new ListPublishedProblems(problems),
    answerProblem: new AnswerProblem({ problems, answers: problemAnswers, now }),
    getProblemStats: new GetProblemStats({ problems, answers: problemAnswers }),
    startCheckout: new StartCheckout(billing, users),
    openBillingPortal: new OpenBillingPortal(billing),
    handleBillingWebhook: new HandleBillingWebhook(billing, users, revenueCatGateway),
    handleRevenueCatWebhook: new HandleRevenueCatWebhook({
      users,
      events: new DrizzleRevenueCatEventRepository(db),
      allowSandbox: env.REVENUECAT_ALLOW_SANDBOX === "true",
    }),
    billingEnabled,
    revenueCatEnabled,
    revenueCatWebhookAuth,
    session,
  };
}
