// application — 特訓クイズのユースケース（開始 / 完了 / 履歴）。
// 無料は「1日3回・開始時に1回消費・JST 0時回復」をサーバで強制する
// （クライアント判定だけにしない。Plan: docs/plans/quiz-training.md）。
// 結果はクライアント採点だが、使う前に必ず QuizResultSchema.parse を通す（背骨ゲート）。
// 成績は本人のみ（履歴は自分の行しか返さず、他人向けレスポンスに含めない）。

import { FREE_QUIZ_PER_DAY, QuizKindSchema, QuizResultSchema } from "@rigel/schema";
import { jstDayOf, withResult, type CompletedQuizSession } from "../domain/quiz/quiz-session";
import type { QuizSessionRepository } from "../domain/quiz/quiz-session.repository";
import type { UserRepository } from "../domain/user/user.repository";

/** 履歴の上限件数（グラフ表示には十分。無制限に D1 を読ませない）。 */
const LIST_LIMIT = 500;

export type StartQuizSessionResult =
  | { ok: true; id: string; remainingToday: number | null }
  | { ok: false; reason: "quota_exceeded" | "invalid" };

export class StartQuizSession {
  constructor(
    private readonly deps: {
      users: UserRepository;
      sessions: QuizSessionRepository;
      now: () => Date;
      newId: () => string;
    },
  ) {}

  async execute(params: { userId: string; kind: unknown }): Promise<StartQuizSessionResult> {
    const kind = QuizKindSchema.safeParse(params.kind);
    if (!kind.success) return { ok: false, reason: "invalid" };

    const now = this.deps.now();
    const day = jstDayOf(now);

    // プラン判定は users.plan（真実源 RevenueCat の D1 射影）。free 以外は無制限。
    const user = await this.deps.users.findById(params.userId);
    if (!user) return { ok: false, reason: "quota_exceeded" }; // 不在は安全側（消費させない）
    const isFree = user.plan === "free";
    if (isFree) {
      const started = await this.deps.sessions.countByUserAndDay(params.userId, day);
      if (started >= FREE_QUIZ_PER_DAY) return { ok: false, reason: "quota_exceeded" };
    }

    const id = this.deps.newId();
    // 開始時に1回消費: 結果 null の行を先に作る（途中離脱も消費のまま）。
    await this.deps.sessions.insert({
      id,
      userId: params.userId,
      kind: kind.data,
      startedDay: day,
      total: null,
      correct: null,
      durationMs: null,
      createdAt: now,
    });
    const remainingToday = isFree
      ? Math.max(
          0,
          FREE_QUIZ_PER_DAY - (await this.deps.sessions.countByUserAndDay(params.userId, day)),
        )
      : null;
    return { ok: true, id, remainingToday };
  }
}

export type FinishQuizSessionResult = { ok: true } | { ok: false; reason: "invalid" | "not_found" };

export class FinishQuizSession {
  constructor(private readonly deps: { sessions: QuizSessionRepository }) {}

  async execute(params: {
    userId: string;
    sessionId: string;
    result: unknown;
  }): Promise<FinishQuizSessionResult> {
    const parsed = QuizResultSchema.safeParse(params.result);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    const session = await this.deps.sessions.findById(params.sessionId);
    // 他人の行・不存在はどちらも not_found（存在を伏せる）。
    if (!session || session.userId !== params.userId) return { ok: false, reason: "not_found" };
    // kind は開始時に確定している（結果で書き換えさせない）。
    if (parsed.data.kind !== session.kind) return { ok: false, reason: "invalid" };
    // 二重送信は最後勝ち（リトライを妨げない）。
    await this.deps.sessions.update(withResult(session, parsed.data));
    return { ok: true };
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
