"use client";

import {
  checkoutErrorMessage,
  isStoreManagedSubscription,
  planCardSubLabel,
  planLabel,
  planMonthlyPrice,
  PLAN_FEATURES,
  type PaidPlan,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createCheckoutAction,
  createPortalAction,
  deleteAccountAction,
  updateProfileAction,
} from "../../app/actions";
import { useAuth } from "../../lib/auth-context";
import { redirectTo } from "../../lib/navigation";
import { AppHeader } from "../AppHeader";
import s from "./account.module.css";

type Plan = "free" | "next" | "pro";

// 提供内容は @rigel/ui の PLAN_FEATURES（mobile のプランシートと共通）。
const PLAN_CARDS: { key: Plan; reco?: boolean; feats: readonly string[] }[] = [
  { key: "free", feats: PLAN_FEATURES.free },
  { key: "next", reco: true, feats: PLAN_FEATURES.next },
  { key: "pro", feats: PLAN_FEATURES.pro },
];

export function SettingsShell() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [save, setSave] = useState<"idle" | "saving" | "saved" | string>("idle");
  // 課金系メッセージ（IAP 案内・checkout/ポータルのエラー）はプロフィール保存行と
  // 別領域（料金プランカードの下）に出す。保存ボタン横に出すと場所的に不自然なため。
  const [billingNote, setBillingNote] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [delArm, setDelArm] = useState(false);

  // ユーザー情報は Cookie セッション由来（auth-context）。フォーム初期値をそこから埋める。
  useEffect(() => {
    if (!user) return;
    setHandle(user.handle ?? "");
    setDisplayName(user.displayName ?? "");
  }, [user]);

  if (authLoading) return <Shell>{<p style={{ color: "#888", padding: 24 }}>…</p>}</Shell>;
  if (!user)
    return (
      <Shell>
        <p className={s.loginNote}>
          設定を開くには <Link href="/login">サインイン</Link> してください。
        </p>
      </Shell>
    );

  const plan: Plan = user.plan ?? "free";
  // 現在プラン行のサブ表示（価格は出さない）。出し分けは @rigel/ui（mobile と共通）。
  const planSub = planCardSubLabel(plan, user.remainingCalls, user.monthlyCallQuota);

  async function onSaveProfile() {
    setSave("saving");
    const res = await updateProfileAction({ handle, displayName });
    if (res.ok) {
      setSave("saved");
      setTimeout(() => setSave("idle"), 1600);
    } else if (res.status === 409) setSave("そのIDは既に使われています");
    else if (res.status === 400) setSave("IDは英数字とアンダースコア3〜20文字です");
    else setSave("保存に失敗しました");
  }

  /** 加入中のプラン変更・解約は Stripe Billing Portal で行う。
   *  Checkout の作り直しは別サブスクを追加してしまい二重課金になる（api 側でも 409 で拒否）。
   *  アプリ内課金（IAP）購読は Stripe ポータルでは扱えない（404 になる）ため、
   *  購入経路（planStore）を見てストアの購読設定へ案内する。 */
  async function openPortal() {
    if (isStoreManagedSubscription(user?.planStore)) {
      setBillingNote(
        "アプリ内課金で購読中です。プランの変更・解約は、購入した端末の購読設定（App Store / Google Play）から行ってください。",
      );
      setPlanOpen(false);
      return;
    }
    const res = await createPortalAction({ returnUrl: `${window.location.origin}/settings` });
    if (res.ok) redirectTo(res.url);
    else {
      setBillingNote(
        res.status === 404 ? "加入中のプランが見つかりませんでした" : "ポータルを開けませんでした",
      );
      setPlanOpen(false);
    }
  }

  async function onPickPlan(target: Plan) {
    if (target === plan) return;
    setBillingNote(null);
    // 加入中（有料プラン）はアップ/ダウングレード・解約ともポータルへ。
    if (plan !== "free") {
      await openPortal();
      return;
    }
    if (target === "free") return; // free ユーザーが free を選ぶことは無い（current で無効化済み）
    const origin = window.location.origin;
    const res = await createCheckoutAction({
      plan: target as PaidPlan,
      successUrl: `${origin}/settings`,
      cancelUrl: `${origin}/settings`,
    });
    if (res.ok) redirectTo(res.url);
    else {
      setBillingNote(checkoutErrorMessage(res.status));
      setPlanOpen(false);
    }
  }

  async function onDelete() {
    // 有料プラン契約中は削除不可（解約が先）。サーバ側でも 403 で弾く。
    if (plan !== "free") return;
    if (!delArm) {
      setDelArm(true);
      setTimeout(() => setDelArm(false), 3000);
      return;
    }
    const res = await deleteAccountAction();
    if (res.ok) {
      await signOut();
      router.push("/");
    }
  }

  return (
    <Shell>
      <div className={s.narrow}>
        <h1 className={s.pageTitle}>設定</h1>

        {/* プロフィール */}
        <section className={s.panel}>
          <h2>プロフィール</h2>
          <div className={`${s.field} ${s.col}`}>
            <span className={s.flabel}>ユーザーID</span>
            <div className={s.idwrap}>
              <span className={s.at}>@</span>
              <input
                className={`${s.txt} ${s.idinput}`}
                type="text"
                maxLength={20}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                aria-label="ユーザーID"
              />
            </div>
            <span className={s.fhint}>英数字とアンダースコアが使えます。共有URLに使われます。</span>
          </div>
          <div className={`${s.field} ${s.col}`}>
            <span className={s.flabel}>ユーザー名</span>
            <input
              className={s.txt}
              type="text"
              maxLength={20}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              aria-label="ユーザー名"
            />
            <span className={s.fhint}>他のユーザーに表示される名前です。</span>
          </div>
          <div className={s.panelFoot}>
            {save === "saved" && <span className={s.saved}>保存しました</span>}
            {save !== "idle" && save !== "saving" && save !== "saved" && (
              <span className={s.errmsg}>{save}</span>
            )}
            <button
              className={s.btn}
              disabled={save === "saving"}
              onClick={() => void onSaveProfile()}
            >
              {save === "saving" ? "保存中…" : "変更を保存"}
            </button>
          </div>
        </section>

        {/* 料金プラン */}
        <section className={s.panel}>
          <h2>料金プラン</h2>
          <div className={s.curplan}>
            <div>
              <div className={s.cpName}>{planLabel(plan)}</div>
              {planSub ? <div className={s.cpPrice}>{planSub}</div> : null}
            </div>
            <button className={`${s.btn} ${s.ghost}`} onClick={() => setPlanOpen(true)}>
              プラン変更
            </button>
          </div>
          {billingNote ? <p className={s.billingNote}>{billingNote}</p> : null}
        </section>

        {/* アカウント */}
        <section className={s.panel}>
          <h2>アカウント</h2>
          <div className={s.panelFoot} style={{ justifyContent: "space-between" }}>
            <button
              className={`${s.btn} ${s.ghost}`}
              onClick={() => void signOut().then(() => router.push("/login"))}
            >
              サインアウト
            </button>
            <button
              className={`${s.btn} ${s.danger}`}
              onClick={() => void onDelete()}
              disabled={plan !== "free"}
              title={plan !== "free" ? "有料プラン契約中は削除できません" : undefined}
            >
              {delArm ? "もう一度押すと削除されます" : "アカウントを削除"}
            </button>
          </div>
          {plan !== "free" ? (
            <p style={{ color: "var(--w45)", fontSize: 12, marginTop: 8 }}>
              有料プラン契約中はアカウントを削除できません。先に料金プランを解約してください。
            </p>
          ) : null}
        </section>
      </div>

      {planOpen && (
        <div className={s.modalOv} onClick={() => setPlanOpen(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHead}>
              <div className={s.modalTitle}>プラン変更</div>
              <button className={s.modalX} aria-label="閉じる" onClick={() => setPlanOpen(false)}>
                ✕
              </button>
            </div>
            <div className={s.modalBody}>
              <div className={s.plans}>
                {PLAN_CARDS.map((p) => {
                  const current = p.key === plan;
                  return (
                    <div
                      key={p.key}
                      className={`${s.planCard} ${p.reco ? s.reco : ""} ${current ? s.current : ""}`}
                    >
                      {p.reco && <div className={s.plRibbon}>おすすめ</div>}
                      <div className={s.plName}>{planLabel(p.key)}</div>
                      <div className={s.plPrice}>
                        <b>
                          {p.key === "free" ? "¥0" : `¥${planMonthlyPrice(p.key).toLocaleString()}`}
                        </b>
                        <span>/月</span>
                      </div>
                      <ul className={s.plFeat}>
                        {p.feats.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                      <button
                        className={s.plCta}
                        disabled={current}
                        onClick={() => void onPickPlan(p.key)}
                      >
                        {current ? "利用中" : "このプランにする"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="settings" />
      <main className={s.main}>{children}</main>
    </div>
  );
}
