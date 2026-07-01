"use client";

import { checkoutErrorMessage, planLabel, planMonthlyPrice, type PaidPlan } from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createCheckoutAction, deleteAccountAction, updateProfileAction } from "../../app/actions";
import { useAuth } from "../../lib/auth-context";
import { AppHeader } from "../AppHeader";
import s from "./account.module.css";

type Plan = "free" | "next" | "pro";

function priceLabel(plan: Plan): string {
  return plan === "free" ? "無料" : `¥${planMonthlyPrice(plan).toLocaleString()} / 月`;
}

const PLAN_CARDS: {
  key: Plan;
  reco?: boolean;
  feats: string[];
}[] = [
  { key: "free", feats: ["非公開の保存 4件まで", "AI再現 月20回相当", "公開・共有リンク"] },
  {
    key: "next",
    reco: true,
    feats: ["非公開の保存 無制限", "AI再現 月100回相当", "お気に入り 無制限"],
  },
  { key: "pro", feats: ["Next の全機能", "AI再現 月320回相当", "（今後）成績・着順の統計"] },
];

export function SettingsShell() {
  const { user, loading: authLoading, signOut } = useAuth();
  const router = useRouter();

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [save, setSave] = useState<"idle" | "saving" | "saved" | string>("idle");
  const [planOpen, setPlanOpen] = useState(false);
  const [delArm, setDelArm] = useState(false);

  // ユーザー情報は Cookie セッション由来（auth-context）。フォーム初期値をそこから埋める。
  useEffect(() => {
    if (!user) return;
    setHandle(user.handle ?? "");
    setDisplayName(user.displayName ?? "");
    setProfilePublic(user.profilePublic ?? true);
  }, [user]);

  if (authLoading) return <Shell>{<p style={{ color: "#888", padding: 24 }}>…</p>}</Shell>;
  if (!user)
    return (
      <Shell>
        <p className={s.loginNote}>
          設定を開くには <Link href="/login">ログイン</Link> してください。
        </p>
      </Shell>
    );

  const plan: Plan = user.plan ?? "free";

  async function onSaveProfile() {
    setSave("saving");
    const res = await updateProfileAction({ handle, displayName, profilePublic });
    if (res.ok) {
      setSave("saved");
      setTimeout(() => setSave("idle"), 1600);
    } else if (res.status === 409) setSave("そのIDは既に使われています");
    else if (res.status === 400) setSave("IDは英数字とアンダースコア3〜20文字です");
    else setSave("保存に失敗しました");
  }

  async function onTogglePublic(next: boolean) {
    setProfilePublic(next);
    await updateProfileAction({ profilePublic: next }).catch(() => {});
  }

  async function onPickPlan(target: Plan) {
    if (target === plan) return;
    if (target === "free") {
      setSave("プランの解約は決済ポータルから行えます（準備中）");
      setTimeout(() => setSave("idle"), 2400);
      setPlanOpen(false);
      return;
    }
    const origin = window.location.origin;
    const res = await createCheckoutAction({
      plan: target as PaidPlan,
      successUrl: `${origin}/settings`,
      cancelUrl: `${origin}/settings`,
    });
    if (res.ok) window.location.href = res.url;
    else {
      setSave(checkoutErrorMessage(res.status));
      setPlanOpen(false);
    }
  }

  async function onDelete() {
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
              <div className={s.cpPrice}>{priceLabel(plan)}</div>
            </div>
            <button className={`${s.btn} ${s.ghost}`} onClick={() => setPlanOpen(true)}>
              プラン変更
            </button>
          </div>
        </section>

        {/* 公開設定 */}
        <section className={s.panel}>
          <h2>公開設定</h2>
          <div className={s.field}>
            <div>
              <span className={s.flabel}>プロフィールを公開する</span>
              <div className={s.fhint}>他のユーザーがあなたの公開牌譜を一覧で見られます。</div>
            </div>
            <label className={s.switch}>
              <input
                type="checkbox"
                checked={profilePublic}
                onChange={(e) => void onTogglePublic(e.target.checked)}
                aria-label="プロフィールを公開する"
              />
              <span className={s.track}>
                <span className={s.knob} />
              </span>
            </label>
          </div>
        </section>

        {/* アカウント */}
        <section className={s.panel}>
          <h2>アカウント</h2>
          <div className={s.panelFoot} style={{ justifyContent: "space-between" }}>
            <button
              className={`${s.btn} ${s.ghost}`}
              onClick={() => void signOut().then(() => router.push("/login"))}
            >
              ログアウト
            </button>
            <button className={`${s.btn} ${s.danger}`} onClick={() => void onDelete()}>
              {delArm ? "もう一度押すと削除されます" : "アカウントを削除"}
            </button>
          </div>
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
