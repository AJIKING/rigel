// ============================================================
// domain/user — User 集約
// ------------------------------------------------------------
// 課金の中心。月◯件までの無料枠を持ち、解析が「成功したときだけ」カウントを進める。
// 信頼ゲート「課金は成功時のみ加算」をこのエンティティの不変条件として表現する。
// 外部依存（DB/HTTP）を持たない純粋なドメインロジック。
// ============================================================

export type Plan = "free" | "paid";

/** 無料プランの月あたり解析上限。【未確定】実際の件数はビジネス判断で確定する（暫定 10）。 */
export const FREE_MONTHLY_QUOTA = 10;

export interface UserProps {
  id: string;
  googleSub: string;
  plan: Plan;
  analysisCountThisMonth: number;
  /** この時刻を過ぎたら当月カウントをリセットする（= 次のリセット境界）。 */
  countResetAt: Date;
}

/** now を含む月の翌月1日(UTC)を返す。12月は自動的に翌年1月へ繰り上がる。 */
export function firstOfNextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export class User {
  readonly id: string;
  readonly googleSub: string;
  private _plan: Plan;
  private _count: number;
  private _countResetAt: Date;

  constructor(props: UserProps) {
    this.id = props.id;
    this.googleSub = props.googleSub;
    this._plan = props.plan;
    this._count = props.analysisCountThisMonth;
    this._countResetAt = props.countResetAt;
  }

  /** 新規ユーザー（Google認証の sub 紐付け）。無料プランで作成する。 */
  static create(params: { id: string; googleSub: string; now: Date }): User {
    return new User({
      id: params.id,
      googleSub: params.googleSub,
      plan: "free",
      analysisCountThisMonth: 0,
      countResetAt: firstOfNextMonthUtc(params.now),
    });
  }

  get plan(): Plan {
    return this._plan;
  }

  get analysisCountThisMonth(): number {
    return this._count;
  }

  get countResetAt(): Date {
    return this._countResetAt;
  }

  /** 月境界を跨いでいたらカウントをリセットする（状態を読む/進める前に必ず適用）。 */
  private applyMonthlyReset(now: Date): void {
    if (now.getTime() >= this._countResetAt.getTime()) {
      this._count = 0;
      this._countResetAt = firstOfNextMonthUtc(now);
    }
  }

  /** いま新規解析を実行できるか。有料は常に可、無料は当月の残枠で判定。 */
  canAnalyze(now: Date): boolean {
    this.applyMonthlyReset(now);
    if (this._plan === "paid") return true;
    return this._count < FREE_MONTHLY_QUOTA;
  }

  /**
   * 解析が「成功したときだけ」呼ぶ。当月カウントを +1 する。
   * 失敗時に呼んではいけない（信頼ゲート: 成功時のみ加算）。
   */
  recordSuccessfulAnalysis(now: Date): void {
    this.applyMonthlyReset(now);
    this._count += 1;
  }

  /**
   * プランを変更する（課金 Webhook から呼ぶ）。
   * 決済の成立/解約は外部(Stripe)の真実なので、ここでは結果のプランを反映するだけ。
   */
  changePlan(plan: Plan): void {
    this._plan = plan;
  }

  /** 永続化用のスナップショット。 */
  toProps(): UserProps {
    return {
      id: this.id,
      googleSub: this.googleSub,
      plan: this._plan,
      analysisCountThisMonth: this._count,
      countResetAt: this._countResetAt,
    };
  }
}
