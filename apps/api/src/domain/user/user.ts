// ============================================================
// domain/user — User 集約
// ------------------------------------------------------------
// 課金の中心。月◯件までの無料枠を持ち、解析が「成功したときだけ」カウントを進める。
// 信頼ゲート「課金は成功時のみ加算」をこのエンティティの不変条件として表現する。
// 外部依存（DB/HTTP）を持たない純粋なドメインロジック。
// ============================================================

export type Plan = "free" | "next" | "pro";

/**
 * プランごとの月あたり Gemini 呼び出し上限。
 * 1局の解析は河(4方向)＋撮影した手牌の枚数ぶん呼び出すので、枠は「局数」ではなく
 * 実呼び出し回数で数える（free 20 ≒ 2局）。
 */
export const MONTHLY_CALL_QUOTA: Record<Plan, number> = { free: 20, next: 100, pro: 320 };

/** プランごとの private(非公開)牌譜の保存上限。null は無制限（public は常に無制限）。 */
export const PRIVATE_KIFU_LIMIT: Record<Plan, number | null> = { free: 4, next: null, pro: null };

/** プランの月間呼び出し上限。 */
export function monthlyCallQuota(plan: Plan): number {
  return MONTHLY_CALL_QUOTA[plan];
}

/** プランの private 牌譜保存上限（null=無制限）。 */
export function privateKifuLimit(plan: Plan): number | null {
  return PRIVATE_KIFU_LIMIT[plan];
}

export interface UserProps {
  id: string;
  googleSub: string;
  plan: Plan;
  analysisCountThisMonth: number;
  /** この時刻を過ぎたら当月カウントをリセットする（= 次のリセット境界）。 */
  countResetAt: Date;
  /** 公開ハンドル(@xxx。共有URLに使う)。未設定は null。一意。 */
  handle?: string | null;
  /** 表示名（他ユーザーに見える名前）。 */
  displayName?: string;
  /** プロフィール(公開牌譜の一覧)を他ユーザーに見せるか。 */
  profilePublic?: boolean;
}

export interface ProfileUpdate {
  handle?: string | null;
  displayName?: string;
  profilePublic?: boolean;
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
  private _handle: string | null;
  private _displayName: string;
  private _profilePublic: boolean;

  constructor(props: UserProps) {
    this.id = props.id;
    this.googleSub = props.googleSub;
    this._plan = props.plan;
    this._count = props.analysisCountThisMonth;
    this._countResetAt = props.countResetAt;
    this._handle = props.handle ?? null;
    this._displayName = props.displayName ?? "";
    this._profilePublic = props.profilePublic ?? true;
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

  get handle(): string | null {
    return this._handle;
  }

  get displayName(): string {
    return this._displayName;
  }

  get profilePublic(): boolean {
    return this._profilePublic;
  }

  /** プロフィールを更新する（指定された項目だけ反映）。handle の検証はアプリ層。 */
  updateProfile(update: ProfileUpdate): void {
    if (update.handle !== undefined) this._handle = update.handle;
    if (update.displayName !== undefined) this._displayName = update.displayName;
    if (update.profilePublic !== undefined) this._profilePublic = update.profilePublic;
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

  /** 当月の残り呼び出し可能回数。 */
  remainingCalls(now: Date): number {
    this.applyMonthlyReset(now);
    return Math.max(0, monthlyCallQuota(this._plan) - this._count);
  }

  /** いま新規解析を実行できるか。当月の枠がまだ残っていれば可。 */
  canAnalyze(now: Date): boolean {
    return this.remainingCalls(now) > 0;
  }

  /**
   * 解析が「成功したときだけ」呼ぶ。当月カウントに実際の Gemini 呼び出し回数を加算する。
   * 失敗時に呼んではいけない（信頼ゲート: 成功時のみ加算）。
   */
  recordGeminiCalls(now: Date, calls: number): void {
    this.applyMonthlyReset(now);
    this._count += Math.max(0, calls);
  }

  /**
   * プランを変更する（課金 Webhook から呼ぶ）。
   * 決済の成立/解約は外部(Stripe)の真実なので、ここでは結果のプランを反映するだけ。
   */
  changePlan(plan: Plan): void {
    this._plan = plan;
  }

  /** 永続化用のスナップショット。 */
  toProps(): Required<UserProps> {
    return {
      id: this.id,
      googleSub: this.googleSub,
      plan: this._plan,
      analysisCountThisMonth: this._count,
      countResetAt: this._countResetAt,
      handle: this._handle,
      displayName: this._displayName,
      profilePublic: this._profilePublic,
    };
  }
}
