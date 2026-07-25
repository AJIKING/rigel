// ============================================================
// domain/user — User 集約
// ------------------------------------------------------------
// 課金の中心。月◯件までの無料枠を持ち、解析が「成功したときだけ」カウントを進める。
// 信頼ゲート「課金は成功時のみ加算」をこのエンティティの不変条件として表現する。
// 外部依存（DB/HTTP）を持たない純粋なドメインロジック。
// ============================================================

import {
  DRAFT_KIFU_LIMIT,
  MONTHLY_CALL_QUOTA,
  PRIVATE_KIFU_LIMIT,
  PROBLEM_LIMIT,
  type Plan,
} from "@rigel/schema";

// プラン型と上限ポリシー定数は背骨（@rigel/schema の plan.ts）が単一真実源。
// api 内の既存 import（user.test.ts / analyze-and-save-kifu 等）を保つため従来名で re-export する
//（DRAFT_LIMIT は schema 側では DRAFT_KIFU_LIMIT）。
export type { Plan };
export { MONTHLY_CALL_QUOTA, PRIVATE_KIFU_LIMIT, DRAFT_KIFU_LIMIT as DRAFT_LIMIT, PROBLEM_LIMIT };

/** プランの月間呼び出し上限。 */
export function monthlyCallQuota(plan: Plan): number {
  return MONTHLY_CALL_QUOTA[plan];
}

/** プランの private(かつ complete) 牌譜保存上限（null=無制限）。 */
export function privateKifuLimit(plan: Plan): number | null {
  return PRIVATE_KIFU_LIMIT[plan];
}

/** プランの下書き(draft)保存上限（null=無制限）。 */
export function draftLimit(plan: Plan): number | null {
  return DRAFT_KIFU_LIMIT[plan];
}

/** プランの何切る問題の保存上限（null=無制限）。 */
export function problemLimit(plan: Plan): number | null {
  return PROBLEM_LIMIT[plan];
}

export interface UserProps {
  id: string;
  /** Google認証の sub。Apple のみのユーザーは null（googleSub/appleSub の少なくとも一方は必須）。 */
  googleSub: string | null;
  /** Apple認証の sub。Google のみのユーザーは null。 */
  appleSub?: string | null;
  /** Sign in with Apple の refresh token（退会時の失効=revoke 専用。API には出さない）。 */
  appleRefreshToken?: string | null;
  plan: Plan;
  analysisCountThisMonth: number;
  /** この時刻を過ぎたら当月カウントをリセットする（= 次のリセット境界）。 */
  countResetAt: Date;
  /** Google アカウントのメール。緊急時・不正アカウント調査の運用のためだけに保存し、
   *  API では絶対にレスポンスしない（外部に出さない）。取得できなければ null。 */
  email?: string | null;
  /** 公開ハンドル(@xxx。共有URLに使う)。未設定は null。一意。 */
  handle?: string | null;
  /** 表示名（他ユーザーに見える名前）。 */
  displayName?: string;
  /** 有料プランの購入経路（RevenueCat の store 値: "APP_STORE" | "PLAY_STORE" | "STRIPE" 等）。
   *  web の購読管理の出し分けに使う。free は null。 */
  planStore?: string | null;
}

export interface ProfileUpdate {
  handle?: string | null;
  displayName?: string;
}

/** now を含む月の翌月1日(UTC)を返す。12月は自動的に翌年1月へ繰り上がる。 */
export function firstOfNextMonthUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export class User {
  readonly id: string;
  readonly googleSub: string | null;
  readonly appleSub: string | null;
  private _appleRefreshToken: string | null;
  private _plan: Plan;
  private _count: number;
  private _countResetAt: Date;
  private _email: string | null;
  private _handle: string | null;
  private _displayName: string;
  private _planStore: string | null;

  constructor(props: UserProps) {
    this.id = props.id;
    this.googleSub = props.googleSub;
    this.appleSub = props.appleSub ?? null;
    if (this.googleSub === null && this.appleSub === null) {
      // 認証プロバイダのIDが1つも無いユーザーはログイン不能な孤児になる（不変条件）。
      throw new Error("User には googleSub / appleSub の少なくとも一方が必要です");
    }
    this._appleRefreshToken = props.appleRefreshToken ?? null;
    this._plan = props.plan;
    this._count = props.analysisCountThisMonth;
    this._countResetAt = props.countResetAt;
    this._email = props.email ?? null;
    this._handle = props.handle ?? null;
    this._displayName = props.displayName ?? "";
    this._planStore = props.planStore ?? null;
  }

  /** 新規ユーザー（Google/Apple 認証の sub 紐付け。少なくとも一方必須）。無料プランで作成する。
   *  表示名(displayName)/公開ID(handle)はプロバイダ情報を使わずランダム値を入れる（設定画面で変更可）。
   *  email は運用のためだけに保存する（API には出さない）。 */
  static create(params: {
    id: string;
    googleSub?: string | null;
    appleSub?: string | null;
    now: Date;
    email?: string | null;
    displayName?: string;
    handle?: string | null;
  }): User {
    return new User({
      id: params.id,
      googleSub: params.googleSub ?? null,
      appleSub: params.appleSub ?? null,
      plan: "free",
      analysisCountThisMonth: 0,
      countResetAt: firstOfNextMonthUtc(params.now),
      email: params.email ?? null,
      displayName: params.displayName,
      handle: params.handle ?? null,
    });
  }

  /** Sign in with Apple の refresh token（退会時の失効専用。API には出さない）。 */
  get appleRefreshToken(): string | null {
    return this._appleRefreshToken;
  }

  /** Apple の refresh token を保存/更新する（サインイン時の code 交換後に呼ぶ）。 */
  setAppleRefreshToken(token: string | null): void {
    this._appleRefreshToken = token;
  }

  get plan(): Plan {
    return this._plan;
  }

  /** 有料プランの購入経路（free / 不明は null）。 */
  get planStore(): string | null {
    return this._planStore;
  }

  get handle(): string | null {
    return this._handle;
  }

  get displayName(): string {
    return this._displayName;
  }

  /** メール（運用専用。API レスポンスには絶対に含めない）。 */
  get email(): string | null {
    return this._email;
  }

  /** プロフィールを更新する（指定された項目だけ反映）。handle の検証はアプリ層。 */
  updateProfile(update: ProfileUpdate): void {
    if (update.handle !== undefined) this._handle = update.handle;
    if (update.displayName !== undefined) this._displayName = update.displayName;
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
   * 決済の成立/解約は外部(Stripe / RevenueCat)の真実なので、ここでは結果のプランを反映するだけ。
   * store は購入経路（RevenueCat の store 値）。free へ落とすときは常にクリアする。
   */
  changePlan(plan: Plan, store: string | null = null): void {
    this._plan = plan;
    this._planStore = plan === "free" ? null : store;
  }

  /** 永続化用のスナップショット。 */
  toProps(): Required<UserProps> {
    return {
      id: this.id,
      googleSub: this.googleSub,
      appleSub: this.appleSub,
      appleRefreshToken: this._appleRefreshToken,
      plan: this._plan,
      analysisCountThisMonth: this._count,
      countResetAt: this._countResetAt,
      email: this._email,
      handle: this._handle,
      displayName: this._displayName,
      planStore: this._planStore,
    };
  }
}
