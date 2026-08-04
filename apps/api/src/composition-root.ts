// ============================================================
// composition-root — 依存の組み立て（DIの単一窓口）
// ------------------------------------------------------------
// Env(バインディング) から、infrastructure の実体を生成し、application の
// ユースケースへ注入する。ここだけが「具体」を知る。interfaces 層はここで
// 組み立てた AppContainer 経由でユースケースを呼ぶ。
// ============================================================

import { AnalyzeAndSaveKifu } from "./application/analyze-and-save-kifu.usecase";
import { AnalyzeProblemDraft } from "./application/analyze-problem-draft.usecase";
import { AuthenticateWithApple } from "./application/authenticate-with-apple.usecase";
import { AuthenticateWithGoogle } from "./application/authenticate-with-google.usecase";
import { AuthenticateWithReviewCode } from "./application/authenticate-with-review-code.usecase";
import { CreateEmptyKifu } from "./application/create-empty-kifu.usecase";
import { GetFavoriteSummary, ListMyFavorites, SetFavorite } from "./application/favorite.usecase";
import { DeleteGame } from "./application/delete-game.usecase";
import { DeleteKifu } from "./application/delete-kifu.usecase";
import { UpdateGame } from "./application/update-game.usecase";
import { UpdateGameRules } from "./application/update-game-rules.usecase";
import { UpdateGamePlayers } from "./application/update-game-players.usecase";
import { UpdateGameStatus } from "./application/update-game-status.usecase";
import { UpdateGameVisibility } from "./application/update-game-visibility.usecase";
import { GetGamePhoto, ListGamePhotos } from "./application/game-photos.usecase";
import { GetGameWithLogs } from "./application/get-game-with-logs.usecase";
import {
  GetProblemAnalysisJob,
  RunProblemAnalysisJob,
  StartProblemAnalysisJob,
} from "./application/problem-analysis-job.usecase";
import {
  DeleteProblemDraft,
  GetProblemDraft,
  ListProblemDrafts,
} from "./application/problem-drafts.usecase";
import { ProblemPhotos } from "./application/problem-photos.usecase";
import { GetKifu } from "./application/get-kifu.usecase";
import { GetPublicGameDetail } from "./application/get-public-game-detail.usecase";
import { GetUser } from "./application/get-user.usecase";
import { HandleBillingWebhook } from "./application/handle-billing-webhook.usecase";
import { HandleRevenueCatWebhook } from "./application/handle-revenuecat-webhook.usecase";
import { OpenBillingPortal } from "./application/open-billing-portal.usecase";
import { ListGames } from "./application/list-games.usecase";
import { ListMyGamesWithCounts, ListPublicGames } from "./application/list-game-cards.usecase";
import { DeleteAccount, GetPublicProfile, UpdateProfile } from "./application/profile.usecase";
import { RetryAnalysisJob } from "./application/retry-analysis-job.usecase";
import { RunAnalysisJob } from "./application/run-analysis-job.usecase";
import { GetAnalysisJob, StartAnalysisJob } from "./application/start-analysis-job.usecase";
import type { AnalysisJobMessage } from "./domain/analysis/analysis-transport";
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
import { QUIZ_ENGINE_VERSION, replayQuizAnswers } from "@rigel/ui";
import {
  FinishQuizSession,
  GetQuizRanking,
  GetQuizSession,
  ListQuizSessions,
  StartQuizSession,
} from "./application/quiz.usecase";
import { StartCheckout } from "./application/start-checkout.usecase";
import { UpdateKifu } from "./application/update-kifu.usecase";
import type { SessionService } from "./domain/auth/session";
import type { Env } from "./env";
import { HttpAppleAuthGateway } from "./infrastructure/auth/http-apple-auth-gateway";
import { JoseAppleTokenVerifier } from "./infrastructure/auth/jose-apple-token-verifier";
import { JoseGoogleTokenVerifier } from "./infrastructure/auth/jose-google-token-verifier";
import { JwtSessionService } from "./infrastructure/auth/jwt-session-service";
import { parseAudiences } from "./infrastructure/auth/oidc";
import { DrizzleRevenueCatEventRepository } from "./infrastructure/billing/drizzle-revenuecat-event.repository";
import { HttpRevenueCatGateway } from "./infrastructure/billing/http-revenuecat-gateway";
import { StripeBillingGateway } from "./infrastructure/billing/stripe-billing-gateway";
import { DrizzleAnalysisJobRepository } from "./infrastructure/analysis/drizzle-analysis-job.repository";
import { DrizzleAnalysisStore } from "./infrastructure/analysis/drizzle-analysis-store";
import { R2AnalysisImageStore } from "./infrastructure/analysis/r2-analysis-image-store";
import { createDb } from "./infrastructure/db/client";
import { DrizzleFavoriteRepository } from "./infrastructure/favorite/drizzle-favorite.repository";
import { DrizzleGameRepository } from "./infrastructure/game/drizzle-game.repository";
import { GeminiAnalyzer } from "./infrastructure/gemini/gemini-analyzer";
import { HttpGeminiClient } from "./infrastructure/gemini/gemini-client";
import { DEFAULT_HAND_MODEL, DEFAULT_RIVER_MODEL } from "./infrastructure/gemini/models";
import { HAND_FROM_TABLE_PROMPT, HAND_PROMPT_SINGLE } from "./infrastructure/gemini/hand-prompt";
import { ImageHandPreprocessor } from "./infrastructure/gemini/image-hand-preprocessor";
import { ImageRiverPreprocessor } from "./infrastructure/gemini/image-river-preprocessor";
import { PhotonImageProcessor } from "./infrastructure/gemini/photon-image-processor";
import { RIVER_PROMPT_SINGLE } from "./infrastructure/gemini/river-prompt";
import { DrizzleGameLogRepository } from "./infrastructure/kifu/drizzle-game-log.repository";
import { DrizzleProblemAnswerRepository } from "./infrastructure/problem/drizzle-problem-answer.repository";
import { DrizzleProblemDraftRepository } from "./infrastructure/problem/drizzle-problem-draft.repository";
import { DrizzleProblemRepository } from "./infrastructure/problem/drizzle-problem.repository";
import { DrizzleQuizSessionRepository } from "./infrastructure/quiz/drizzle-quiz-session.repository";
import { DrizzleAccountStore } from "./infrastructure/user/drizzle-account-store";
import { DrizzleUserRepository } from "./infrastructure/user/drizzle-user.repository";

export interface AppContainer {
  analyzeAndSaveKifu: AnalyzeAndSaveKifu;
  /** 解析の非同期ジョブ化（202 + ポーリング + キュー consumer。docs/plans/async-analysis.md）。 */
  startAnalysisJob: StartAnalysisJob;
  getAnalysisJob: GetAnalysisJob;
  runAnalysisJob: RunAnalysisJob;
  /** もう一度解析（Phase 2。失敗ジョブの再 enqueue）。 */
  retryAnalysisJob: RetryAnalysisJob;
  /** 半荘の元写真（恒久保存・所有者のみ。photo-retention.md）。 */
  listGamePhotos: ListGamePhotos;
  getGamePhoto: GetGamePhoto;
  analyzeProblemDraft: AnalyzeProblemDraft;
  /** 何切るの写真AI再現の非同期ジョブ化（結果は解析下書きへ。photo-retention.md）。 */
  startProblemAnalysisJob: StartProblemAnalysisJob;
  getProblemAnalysisJob: GetProblemAnalysisJob;
  runProblemAnalysisJob: RunProblemAnalysisJob;
  /** 解析下書き（一覧・取得・破棄）。 */
  listProblemDrafts: ListProblemDrafts;
  /** 何切るの元写真（問題/下書き。所有者のみ）。 */
  problemPhotos: ProblemPhotos;
  getProblemDraft: GetProblemDraft;
  deleteProblemDraft: DeleteProblemDraft;
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
  authenticateWithApple: AuthenticateWithApple;
  /** Sign in with Apple の設定（APPLE_CLIENT_ID）が揃っているか。未設定なら /auth/apple は 501。 */
  appleAuthEnabled: boolean;
  authenticateWithReviewCode: AuthenticateWithReviewCode;
  /** ストア審査用ログインの Secret（REVIEW_LOGIN_SECRET）が設定されているか。未設定なら /auth/review は 501。 */
  reviewAuthEnabled: boolean;
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
  setFavorite: SetFavorite;
  getFavoriteSummary: GetFavoriteSummary;
  listMyFavorites: ListMyFavorites;
  startQuizSession: StartQuizSession;
  finishQuizSession: FinishQuizSession;
  getQuizSession: GetQuizSession;
  getQuizRanking: GetQuizRanking;
  listQuizSessions: ListQuizSessions;
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

export function buildContainer(env: Env): AppContainer {
  const db = createDb(env.DB);
  const users = new DrizzleUserRepository(db);
  const gameLogs = new DrizzleGameLogRepository(db);
  const gamesRepo = new DrizzleGameRepository(db);
  const problems = new DrizzleProblemRepository(db);
  const problemDrafts = new DrizzleProblemDraftRepository(db);
  const problemAnswers = new DrizzleProblemAnswerRepository(db);
  const quizSessions = new DrizzleQuizSessionRepository(db);
  const favorites = new DrizzleFavoriteRepository(db);

  // 副作用（時刻・ID生成）の供給は1か所に集約してユースケースへ注入する。
  const now = () => new Date();
  const newId = () => crypto.randomUUID();
  // 初回プロフィールのランダム handle（Google 情報は使わない）。英数字・11文字で HANDLE_RE を満たす。
  const randomHandle = () => "u" + crypto.randomUUID().replace(/-/g, "").slice(0, 10);

  const photon = new PhotonImageProcessor();
  const analyzer = new GeminiAnalyzer({
    client: new HttpGeminiClient({
      apiKey: env.GEMINI_API_KEY,
      baseUrl: env.CLOUDFLARE_AI_GATEWAY_URL,
      gatewayToken: env.CLOUDFLARE_AI_GATEWAY_TOKEN,
    }),
    // 河1枚 → 4分割＋正立（Photon/WASM）。
    preprocessor: new ImageRiverPreprocessor(photon),
    // 1枚モード: 河写真の下端帯 → 手前の手牌（docs/plans/one-shot-hand.md）。
    handPreprocessor: new ImageHandPreprocessor(photon),
    riverPrompt: RIVER_PROMPT_SINGLE,
    riverModel: env.GEMINI_RIVER_MODEL ?? DEFAULT_RIVER_MODEL,
    handPrompt: HAND_PROMPT_SINGLE,
    handTablePrompt: HAND_FROM_TABLE_PROMPT,
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

  const analysisStore = new DrizzleAnalysisStore(db);

  // Sign in with Apple（App Store 審査要件 4.8）。APPLE_CLIENT_ID 未設定なら受け口は 501。
  // 退会時のトークン失効（revoke）は .p8 鍵一式が揃っているときだけ有効（ベストエフォート）。
  const appleClientId = env.APPLE_CLIENT_ID ?? "";
  const appleAuthEnabled = Boolean(appleClientId);
  const appleAuth =
    appleAuthEnabled && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
      ? new HttpAppleAuthGateway({
          teamId: env.APPLE_TEAM_ID,
          keyId: env.APPLE_KEY_ID,
          privateKey: env.APPLE_PRIVATE_KEY,
          clientIds: parseAudiences(appleClientId),
        })
      : null;

  const analyzeAndSaveKifu = new AnalyzeAndSaveKifu({
    users,
    games: gamesRepo,
    gameLogs,
    analyzer,
    store: analysisStore,
    now,
    newId,
  });
  const analyzeProblemDraft = new AnalyzeProblemDraft({
    users,
    analyzer,
    store: analysisStore,
    now,
  });
  const analysisJobs = new DrizzleAnalysisJobRepository(db);
  const analysisImages = new R2AnalysisImageStore(env.PHOTOS);
  const analysisQueue = {
    send: async (message: AnalysisJobMessage) => {
      await env.ANALYSIS_QUEUE.send(message);
    },
  };

  return {
    analyzeAndSaveKifu,
    startAnalysisJob: new StartAnalysisJob({
      jobs: analysisJobs,
      images: analysisImages,
      queue: analysisQueue,
      games: gamesRepo,
      analyze: analyzeAndSaveKifu,
      now,
      newId,
    }),
    getAnalysisJob: new GetAnalysisJob(analysisJobs),
    listGamePhotos: new ListGamePhotos(gamesRepo, analysisImages),
    getGamePhoto: new GetGamePhoto(gamesRepo, analysisImages),
    retryAnalysisJob: new RetryAnalysisJob({
      jobs: analysisJobs,
      images: analysisImages,
      queue: analysisQueue,
      analyze: analyzeAndSaveKifu,
      now,
    }),
    runAnalysisJob: new RunAnalysisJob({
      jobs: analysisJobs,
      images: analysisImages,
      analyze: analyzeAndSaveKifu,
      now,
    }),
    // 何切るの写真AI再現（保存なし・ドラフト返却のみ。課金カウントは共有ストアで原子加算）。
    analyzeProblemDraft,
    startProblemAnalysisJob: new StartProblemAnalysisJob({
      jobs: analysisJobs,
      drafts: problemDrafts,
      images: analysisImages,
      queue: analysisQueue,
      analyze: analyzeProblemDraft,
      now,
      newId,
    }),
    getProblemAnalysisJob: new GetProblemAnalysisJob(analysisJobs, problemDrafts),
    runProblemAnalysisJob: new RunProblemAnalysisJob({
      jobs: analysisJobs,
      drafts: problemDrafts,
      images: analysisImages,
      analyze: analyzeProblemDraft,
      now,
    }),
    listProblemDrafts: new ListProblemDrafts(problemDrafts, analysisJobs, now),
    problemPhotos: new ProblemPhotos(problems, problemDrafts, analysisImages),
    getProblemDraft: new GetProblemDraft(problemDrafts, analysisJobs, now),
    deleteProblemDraft: new DeleteProblemDraft(problemDrafts, analysisImages, analysisJobs),
    getKifu: new GetKifu(gameLogs),
    listKifu: new ListKifu(gameLogs),
    updateKifu: new UpdateKifu(gameLogs),
    deleteKifu: new DeleteKifu(gameLogs),
    deleteGame: new DeleteGame(gamesRepo, gameLogs, favorites, analysisJobs, analysisImages),
    updateGame: new UpdateGame(gamesRepo),
    updateGameRules: new UpdateGameRules(gamesRepo, gameLogs),
    updateGamePlayers: new UpdateGamePlayers(gamesRepo, gameLogs),
    updateGameVisibility: new UpdateGameVisibility(gamesRepo, gameLogs, users),
    updateGameStatus: new UpdateGameStatus(gamesRepo, gameLogs, users),
    createEmptyKifu: new CreateEmptyKifu({ games: gamesRepo, gameLogs, users, now, newId }),
    listGames: new ListGames(gamesRepo),
    listMyGamesWithCounts: new ListMyGamesWithCounts(gamesRepo, gameLogs, analysisJobs, now),
    listPublicGames: new ListPublicGames(gamesRepo, gameLogs, users),
    getGameWithLogs: new GetGameWithLogs(gamesRepo, gameLogs, analysisJobs, now),
    getPublicGameDetail: new GetPublicGameDetail(gamesRepo, gameLogs, users),
    authenticateWithGoogle: new AuthenticateWithGoogle({
      users,
      verifier: new JoseGoogleTokenVerifier(env.GOOGLE_CLIENT_ID),
      session,
      now,
      newId,
      randomHandle,
    }),
    authenticateWithApple: new AuthenticateWithApple({
      users,
      verifier: new JoseAppleTokenVerifier(appleClientId),
      appleAuth,
      session,
      now,
      newId,
      randomHandle,
    }),
    appleAuthEnabled,
    authenticateWithReviewCode: new AuthenticateWithReviewCode({
      users,
      session,
      now,
      newId,
      randomHandle,
      secret: env.REVIEW_LOGIN_SECRET ?? "",
    }),
    reviewAuthEnabled: Boolean(env.REVIEW_LOGIN_SECRET),
    getUser: new GetUser(users),
    updateProfile: new UpdateProfile(users),
    getPublicProfile: new GetPublicProfile(users, gamesRepo, gameLogs),
    deleteAccount: new DeleteAccount(users, new DrizzleAccountStore(db), appleAuth, {
      games: gamesRepo,
      images: analysisImages,
      drafts: problemDrafts,
      problems,
    }),
    createProblem: new CreateProblem({
      problems,
      users,
      drafts: problemDrafts,
      jobs: analysisJobs,
      now,
      newId,
    }),
    updateProblem: new UpdateProblem(problems),
    deleteProblem: new DeleteProblem(problems, problemAnswers, favorites, analysisImages),
    getProblem: new GetProblem(problems),
    listMyProblems: new ListMyProblems(problems),
    listPublishedProblems: new ListPublishedProblems(problems),
    answerProblem: new AnswerProblem({ problems, answers: problemAnswers, now }),
    getProblemStats: new GetProblemStats({ problems, answers: problemAnswers }),
    setFavorite: new SetFavorite({ favorites, games: gamesRepo, gameLogs, problems, now }),
    getFavoriteSummary: new GetFavoriteSummary(favorites),
    listMyFavorites: new ListMyFavorites({
      favorites,
      games: gamesRepo,
      gameLogs,
      problems,
      users,
    }),
    startQuizSession: new StartQuizSession({
      users,
      sessions: quizSessions,
      now,
      newId,
      // 出題シード（uint32）。乱数の質は不要（推測されても採点はサーバのリプレイが握る）。
      newSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!,
    }),
    finishQuizSession: new FinishQuizSession({
      users,
      sessions: quizSessions,
      now,
      engineVersion: QUIZ_ENGINE_VERSION,
      replay: replayQuizAnswers,
    }),
    getQuizSession: new GetQuizSession({ users, sessions: quizSessions }),
    getQuizRanking: new GetQuizRanking({ sessions: quizSessions, now }),
    listQuizSessions: new ListQuizSessions({ sessions: quizSessions }),
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
