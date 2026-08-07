// application — 特訓クイズのユースケース（開始 / 完了 / 履歴）。
// 無料は「1日 FREE_QUIZ_PER_DAY 回・開始時に1回消費・JST 0時回復」をサーバで強制する
// （クライアント判定だけにしない。Plan: docs/plans/quiz-training.md）。
// 完了は QuizFinishSchema.parse を通し（背骨ゲート）、全回答つきなら**サーバのシードリプレイ
// 再採点**で total/correct を確定する（クライアント申告値をランキングに載せない。
// Plan: docs/plans/quiz-open-and-ranking.md Phase 3/4）。
// 成績は本人のみ（履歴は自分の行しか返さず、他人向けレスポンスに含めない）。

import {
  FREE_QUIZ_PER_DAY,
  jstDayOf,
  jstStartOfMonth,
  jstStartOfWeek,
  QuizAnswerRecordsSchema,
  QuizFinishSchema,
  QuizKindSchema,
  QuizRankingPeriodSchema,
  type QuizAnswerRecord,
  type QuizKind,
  type QuizRankingPeriod,
  type QuizSubmittedAnswer,
} from "@rigel/schema";
import { buildQuizRanking, QUIZ_SESSION_SECONDS, type QuizRankingBoard } from "@rigel/ui";
import {
  withResult,
  withVerifiedResult,
  type CompletedQuizSession,
} from "../domain/quiz/quiz-session";
import type { QuizSessionRepository } from "../domain/quiz/quiz-session.repository";
import type { UserRepository } from "../domain/user/user.repository";

/** 履歴の上限件数（グラフ表示には十分。無制限に D1 を読ませない）。 */
const LIST_LIMIT = 500;

export type StartQuizSessionResult =
  | { ok: true; id: string; seed: number; remainingToday: number | null }
  | { ok: false; reason: "quota_exceeded" | "invalid" };

export class StartQuizSession {
  constructor(
    private readonly deps: {
      users: UserRepository;
      sessions: QuizSessionRepository;
      now: () => Date;
      newId: () => string;
      /** 出題シードの発行（uint32。クライアントはこのシードで生成し、サーバが同じシードで
       *  再生成して採点し直す）。 */
      newSeed: () => number;
    },
  ) {}

  async execute(params: { userId: string; kind: unknown }): Promise<StartQuizSessionResult> {
    const kind = QuizKindSchema.safeParse(params.kind);
    if (!kind.success) return { ok: false, reason: "invalid" };

    const now = this.deps.now();
    const day = jstDayOf(now);

    // プラン判定は users.plan（真実源 RevenueCat の D1 射影）。free 以外は無制限（null）。
    const user = await this.deps.users.findById(params.userId);
    if (!user) return { ok: false, reason: "quota_exceeded" }; // 不在は安全側（消費させない）
    let remainingToday: number | null = null;
    if (user.plan === "free") {
      const started = await this.deps.sessions.countByUserAndDay(params.userId, day);
      if (started >= FREE_QUIZ_PER_DAY) return { ok: false, reason: "quota_exceeded" };
      // 消費後の残りは開始前カウント+1 から算出（INSERT 後の再カウント=D1 二度読みをしない）。
      // count→insert は非原子で並行開始により僅かに超え得るが、有界オーバーシュートとして
      // 許容済み（docs/plans/quiz-training.md 10章）。Math.max 0 で負値だけ防ぐ。
      remainingToday = Math.max(0, FREE_QUIZ_PER_DAY - (started + 1));
    }

    const id = this.deps.newId();
    const seed = this.deps.newSeed();
    // 開始時に1回消費: 結果 null の行を先に作る（途中離脱も消費のまま）。
    await this.deps.sessions.insert({
      id,
      userId: params.userId,
      kind: kind.data,
      startedDay: day,
      seed,
      total: null,
      correct: null,
      durationMs: null,
      verified: false,
      records: null,
      createdAt: now,
    });
    return { ok: true, id, seed, remainingToday };
  }
}

export type FinishQuizSessionResult = { ok: true } | { ok: false; reason: "invalid" | "not_found" };

export class FinishQuizSession {
  constructor(
    private readonly deps: {
      users: UserRepository;
      sessions: QuizSessionRepository;
      now: () => Date;
      /** サーバ側の出題エンジン版数（@rigel/ui QUIZ_ENGINE_VERSION を配線）。クライアント申告と
       *  不一致ならリプレイ結果が食い違うので unverified に落とす。 */
      engineVersion: number;
      /** シードリプレイ再採点（既定は @rigel/ui replayQuizAnswers。テストは固定出題を注入）。 */
      replay: (
        kind: QuizKind,
        seed: number,
        answers: readonly QuizSubmittedAnswer[],
      ) => QuizAnswerRecord[];
    },
  ) {}

  async execute(params: {
    userId: string;
    sessionId: string;
    result: unknown;
  }): Promise<FinishQuizSessionResult> {
    const parsed = QuizFinishSchema.safeParse(params.result);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    // session と user は互いに独立な読み（user は records 保存可否の plan 判定にだけ使う）。
    // 直列で D1 を2往復しない。
    const [session, user] = await Promise.all([
      this.deps.sessions.findById(params.sessionId),
      this.deps.users.findById(params.userId),
    ]);
    // 他人の行・不存在はどちらも not_found（存在を伏せる）。
    if (!session || session.userId !== params.userId) return { ok: false, reason: "not_found" };
    // kind は開始時に確定している（結果で書き換えさせない）。
    if (parsed.data.kind !== session.kind) return { ok: false, reason: "invalid" };

    // 一度 verified で確定した行は不変（イミュータブル）。リトライの二重送信は 200 の
    // no-op で受け（クライアントの再送を妨げない）、**オフラインで解いた回答での差し替え**
    // （検証済みスコアの後出し置換）を塞ぐ。2026-08-04 設計レビューで追加。
    if (session.verified) return { ok: true };

    const f = parsed.data;
    // シードリプレイ再採点: 全回答＋版数一致＋シードあり（旧行以外）のときだけ成立する。
    // total/correct は**サーバ採点値**で確定し、申告値は使わない（チート対策の芯）。
    if (
      f.answers !== undefined &&
      f.engineVersion === this.deps.engineVersion &&
      session.seed !== null
    ) {
      const records = this.deps.replay(session.kind, session.seed, f.answers);
      // 実プレイ時間のサーバ強制: 開始（INSERT のサーバ実時刻）→完了が60秒未満の申告は
      // 早回しなので unverified（記録自体は残す＝本人の履歴には出る・ランキングに載らない）。
      const elapsedMs = this.deps.now().getTime() - session.createdAt.getTime();
      const timeOk = elapsedMs >= QUIZ_SESSION_SECONDS * 1000;
      // 見直しレコードの保存は有料のみ（無料は検証に使って捨てる。Plan Phase 3）。
      const keepRecords = user !== null && user.plan !== "free";
      await this.deps.sessions.update(
        withVerifiedResult(session, {
          records,
          // 所要時間もサーバ実測で上限を切る（申告値がサーバ経過より長いことはあり得ない）。
          durationMs: Math.min(f.durationMs, elapsedMs),
          timeOk,
          keepRecords,
        }),
      );
      return { ok: true };
    }

    // 旧クライアント互換（answers なし・版数不一致・旧行）: 申告値のまま unverified で記録。
    // 二重送信は最後勝ち（リトライを妨げない）。
    await this.deps.sessions.update(
      withResult(session, {
        kind: f.kind,
        total: f.total,
        correct: f.correct,
        durationMs: f.durationMs,
      }),
    );
    return { ok: true };
  }
}

export type GetQuizSessionResult =
  | { ok: true; session: CompletedQuizSession; records: QuizAnswerRecord[] | null }
  | { ok: false; reason: "not_found" };

/**
 * セッション詳細（本人のみ・完了済みのみ）。
 * records は**現在の plan が有料のときだけ**返す（ダウングレード時は全て閲覧不可
 * [決定] 2026-08-04 ⑤。行は保持するので再アップグレードで閲覧が復活する）。
 */
export class GetQuizSession {
  constructor(private readonly deps: { users: UserRepository; sessions: QuizSessionRepository }) {}

  async execute(params: { userId: string; sessionId: string }): Promise<GetQuizSessionResult> {
    // session と user（plan 判定用）は独立な読みなので並列に。
    const [session, user] = await Promise.all([
      this.deps.sessions.findById(params.sessionId),
      this.deps.users.findById(params.userId),
    ]);
    // 他人の行・不存在・未完了はどれも not_found（存在を伏せる）。
    if (!session || session.userId !== params.userId || session.total === null) {
      return { ok: false, reason: "not_found" };
    }
    const paid = user !== null && user.plan !== "free";
    // D1 の records JSON は保存時こそサーバ再生成（信頼できる）だが、読み出しは背骨を
    // 通してから返す: 将来 QuizQuestionSchema を変更したとき、旧スナップショットが
    // 未検証のままクライアントへ流れるのを防ぐ（壊れた行・null は safeParse 失敗 → 非表示）。
    const parsedRecords = paid ? QuizAnswerRecordsSchema.safeParse(session.records) : null;
    return {
      ok: true,
      // total !== null を検査済み（完了行のみここに来る。correct/durationMs も同時に書かれる）。
      session: session as CompletedQuizSession,
      records: parsedRecords?.success ? parsedRecords.data : null,
    };
  }
}

export type GetQuizRankingResult =
  | ({ ok: true; kind: QuizKind; period: QuizRankingPeriod } & QuizRankingBoard)
  | { ok: false; reason: "invalid" };

/** 期間→集計窓の開始時刻（null=全期間）。**exhaustive な Record** なので、背骨の
 *  QuizRankingPeriodSchema に期間を追加してここを忘れるとコンパイルエラーになる
 *  （三項の else に落ちて「全期間として集計される」サイレントバグを防ぐ）。 */
const PERIOD_SINCE: Record<QuizRankingPeriod, (now: Date) => Date | null> = {
  weekly: jstStartOfWeek,
  monthly: jstStartOfMonth,
  all: () => null,
};

/**
 * 特訓ランキング（種目別 × 週間/月間/全期間。[決定] 2026-08-04 強制表示）。
 * 集計対象は verified セッションのみ（サーバ再採点＋実時間チェック通過＝申告値を載せない）。
 * 匿名でも閲覧可。viewerId があれば自分の順位（圏外含む）を付ける。
 */
export class GetQuizRanking {
  constructor(private readonly deps: { sessions: QuizSessionRepository; now: () => Date }) {}

  async execute(params: {
    kind: unknown;
    period: unknown;
    viewerId: string | null;
  }): Promise<GetQuizRankingResult> {
    const kind = QuizKindSchema.safeParse(params.kind);
    if (!kind.success) return { ok: false, reason: "invalid" };
    const period = QuizRankingPeriodSchema.safeParse(params.period);
    if (!period.success) return { ok: false, reason: "invalid" };

    const since = PERIOD_SINCE[period.data](this.deps.now());
    const rows = await this.deps.sessions.aggregateVerified(kind.data, since);
    return {
      ok: true,
      kind: kind.data,
      period: period.data,
      ...buildQuizRanking(rows, params.viewerId),
    };
  }
}

export type ListQuizSessionsResult =
  { ok: true; sessions: CompletedQuizSession[] } | { ok: false; reason: "invalid" };

export class ListQuizSessions {
  constructor(private readonly deps: { sessions: QuizSessionRepository }) {}

  async execute(params: { userId: string; since?: string }): Promise<ListQuizSessionsResult> {
    let since: Date | null = null;
    if (params.since !== undefined) {
      since = new Date(params.since);
      if (Number.isNaN(since.getTime())) return { ok: false, reason: "invalid" };
    }
    const sessions = await this.deps.sessions.listCompletedByUser(params.userId, since, LIST_LIMIT);
    return { ok: true, sessions };
  }
}
