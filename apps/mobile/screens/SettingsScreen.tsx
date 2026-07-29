import { planCardSubLabel, planLabel, upgradeTargets, type PaidPlan, type Plan } from "@rigel/ui";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AppBar } from "../components/AppBar";
import { PlanSheet } from "../components/PlanSheet";
import { createPortal, deleteAccount, updateProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { purchasePlan, purchasesManagementUrl } from "../lib/purchases";
import { SITE_ORIGIN } from "../lib/site";
import { colors, radius } from "../lib/theme";

// 決済（外部ブラウザ）から戻る先。web の設定ページ（本番ドメイン）。
// TODO(deep-link): アプリへ直接戻すならユニバーサルリンク/カスタムスキームを設定する。
const BILLING_RETURN_URL = `${SITE_ORIGIN}/settings`;

export function SettingsScreen() {
  const { user, token, signOut, refresh, endGuest } = useAuth();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  // 課金系メッセージはプロフィール保存行と別領域（料金プラン節の全幅行）に出す。
  // 長文（購入お礼など）を保存ボタンと横並びにするとレイアウトが崩れるため。
  const [billingNote, setBillingNote] = useState<string | null>(null);
  // 購入直後に反映を待っているプラン。webhook（サーバ側）反映まで /me を追いかける。
  const [pendingPlan, setPendingPlan] = useState<PaidPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [delArm, setDelArm] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHandle(user.handle ?? "");
    setDisplayName(user.displayName ?? "");
  }, [user]);

  const plan: Plan = user?.plan ?? "free";
  const targets = token ? upgradeTargets(plan) : [];
  // 現在プラン行のサブ表示（価格は出さない）。出し分けは @rigel/ui（web と共通）。
  const planSub = planCardSubLabel(plan, user?.remainingCalls, user?.monthlyCallQuota);

  // 購入後ポーリング: plan は RevenueCat Webhook → users.plan 経由で数秒遅れて変わるため、
  // 反映されるまで /me を定期再取得する。30秒で打ち切り（webhook 遅延・障害時に無限に叩かない）。
  useEffect(() => {
    if (!pendingPlan) return;
    if (plan === pendingPlan) {
      setPendingPlan(null);
      setBillingNote("プランが反映されました");
      return;
    }
    const poll = setInterval(() => void refresh(), 3000);
    const giveUp = setTimeout(() => {
      setPendingPlan(null);
      setBillingNote("反映に時間がかかっています。しばらくしてからこの画面を開き直してください");
    }, 30000);
    return () => {
      clearInterval(poll);
      clearTimeout(giveUp);
    };
  }, [pendingPlan, plan, refresh]);

  async function onSaveProfile() {
    if (!token) return;
    setSaving(true);
    setNote(null);
    const res = await updateProfile(token, { handle, displayName });
    setSaving(false);
    if (res.ok) {
      setNote("保存しました");
      // 認証コンテキストの user も最新化する（他画面の表示名などに反映）。
      void refresh();
    } else if (res.status === 409) setNote("そのIDは既に使われています");
    else if (res.status === 400) setNote("IDは英数字とアンダースコア3〜20文字です");
    else setNote("保存に失敗しました");
  }

  // シートで選んだプランを購入する（free → 有料の新規加入のみ。加入中は onOpenPortal）。
  // iOS/Android とも RevenueCat（StoreKit / Play Billing）で購入する。アプリ内から
  // web 決済（Stripe）への誘導はしない（アンチステアリング規約）。
  async function onSelectPlan(plan: PaidPlan) {
    setPlanOpen(false);
    if (!token) return;
    setBillingNote(null);

    const outcome = await purchasePlan(plan);
    if (outcome === "purchased") {
      // plan 反映はサーバ側（RevenueCat Webhook → users.plan）経由のため数秒遅れることがある。
      setBillingNote(
        "購入ありがとうございます。プランを反映しています…（数秒かかることがあります）",
      );
      setPendingPlan(plan);
      void refresh();
    } else if (outcome === "failed") {
      setBillingNote("購入に失敗しました");
    } else if (outcome === "unavailable") {
      setBillingNote("アプリ内購入は現在利用できません");
    }
    // cancelled はユーザーの意思なので黙る。
  }

  // 加入中のプラン変更・解約。ストア購読（IAP）は OS の購読管理（RevenueCat の管理URL）へ、
  // web 購入（Stripe）は決済ポータルへ（Checkout の作り直しは二重課金になる）。
  async function onOpenPortal() {
    if (!token) return;
    setBillingNote(null);
    const managementUrl = await purchasesManagementUrl();
    if (managementUrl) {
      await Linking.openURL(managementUrl).catch(() =>
        setBillingNote("購読管理を開けませんでした"),
      );
      return;
    }
    try {
      const res = await createPortal(token, { returnUrl: BILLING_RETURN_URL });
      if (res.ok) await Linking.openURL(res.url);
      else
        setBillingNote(
          res.status === 404
            ? "加入中のプランが見つかりませんでした"
            : "ポータルを開けませんでした",
        );
    } catch {
      setBillingNote("通信に失敗しました。");
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
    if (token) {
      const res = await deleteAccount(token);
      if (res.ok) signOut();
      else if (res.status === 403) setNote("有料プラン契約中はアカウントを削除できません。");
      else setNote("削除に失敗しました。");
    }
  }

  return (
    <View style={styles.root}>
      <AppBar title="設定" />
      <View style={styles.body}>
        <SectionTitle>プロフィール</SectionTitle>
        <Group>
          <Item icon={<IconUser />}>
            <TextInput
              style={styles.idInput}
              value={handle}
              onChangeText={setHandle}
              autoCapitalize="none"
              placeholder="@ユーザーID"
              placeholderTextColor={colors.w45}
              accessibilityLabel="ユーザーID"
            />
          </Item>
          <Item icon={<IconLines />} last>
            <TextInput
              style={styles.idInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="ユーザー名"
              placeholderTextColor={colors.w45}
              accessibilityLabel="ユーザー名"
            />
          </Item>
        </Group>
        <View style={styles.saveRow}>
          {note ? (
            <Text style={styles.note} testID="profile-note">
              {note}
            </Text>
          ) : (
            <View />
          )}
          <Pressable
            style={[styles.saveBtn, (saving || !token) && styles.disabled]}
            disabled={saving || !token}
            onPress={() => void onSaveProfile()}
          >
            <Text style={styles.saveText}>{saving ? "保存中…" : "変更を保存"}</Text>
          </Pressable>
        </View>

        <SectionTitle>料金プラン</SectionTitle>
        <Group>
          <View style={styles.plan}>
            <Text style={styles.pin}>現在</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{planLabel(plan)}</Text>
              {planSub ? <Text style={styles.planPrice}>{planSub}</Text> : null}
            </View>
            {token && plan === "free" && targets.length > 0 ? (
              <Pressable
                onPress={() => setPlanOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="プランを変更"
                hitSlop={10}
              >
                <Text style={styles.go}>変更 ›</Text>
              </Pressable>
            ) : null}
            {token && plan !== "free" ? (
              <Pressable
                onPress={() => void onOpenPortal()}
                accessibilityRole="button"
                accessibilityLabel="プランを管理"
                hitSlop={10}
              >
                <Text style={styles.go}>管理 ›</Text>
              </Pressable>
            ) : null}
          </View>
        </Group>
        {billingNote ? (
          <Text style={styles.billingNote} testID="billing-note">
            {billingNote}
          </Text>
        ) : null}

        {/* アカウント操作はログイン時のみ（ゲストにはアカウントが無いので無意味）。 */}
        {token ? (
          <>
            <SectionTitle>アカウント</SectionTitle>
            <Group>
              <Pressable onPress={() => signOut()}>
                <Item icon={<IconLogout />}>
                  <Text style={styles.itemTitle}>サインアウト</Text>
                  <Chevron />
                </Item>
              </Pressable>
              <Pressable onPress={() => void onDelete()} disabled={plan !== "free"}>
                <Item icon={<IconTrash danger={plan === "free"} />} last>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.itemTitle,
                        { color: plan === "free" ? colors.vermilion : colors.w45 },
                      ]}
                    >
                      {delArm ? "もう一度押すと削除されます" : "アカウントを削除"}
                    </Text>
                    {plan !== "free" ? (
                      <Text style={styles.itemSub}>有料プラン契約中は削除できません</Text>
                    ) : null}
                  </View>
                  {plan === "free" ? <Chevron danger /> : null}
                </Item>
              </Pressable>
            </Group>
          </>
        ) : null}

        {!token ? (
          <>
            <Text style={styles.loginNote}>設定の保存にはサインインが必要です。</Text>
            {/* ゲストからサインインへ戻る唯一の入口（App の入口ゲートへ戻す）。 */}
            <Pressable
              style={styles.signInBtn}
              onPress={() => endGuest()}
              accessibilityRole="button"
            >
              <Text style={styles.signInText}>サインインする</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {/* プラン変更: 下からのシートで選択（アプリはストア掲載価格を表示）。 */}
      {planOpen ? (
        <PlanSheet
          targets={targets}
          onSelect={(p) => void onSelectPlan(p)}
          onClose={() => setPlanOpen(false)}
        />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.stitle}>{children}</Text>;
}

function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

function Item({
  icon,
  children,
  last,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <View style={[styles.item, last && styles.itemLast]}>
      <View style={styles.ic}>{icon}</View>
      {children}
    </View>
  );
}

function Chevron({ danger }: { danger?: boolean }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 6l6 6-6 6"
        stroke={danger ? colors.vermilion : colors.w45}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const stroke = (danger?: boolean) => ({
  stroke: danger ? colors.vermilion : colors.accent,
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  fill: "none" as const,
});

function IconUser() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M4 20c1.5-4 14.5-4 16 0" {...stroke()} />
      <Circle cx={12} cy={8} r={4} {...stroke()} />
    </Svg>
  );
}
function IconLines() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M4 7h16M4 12h16M4 17h10" {...stroke()} />
    </Svg>
  );
}
function IconLogout() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M15 4h4v16h-4" {...stroke()} />
      <Path d="M10 8l-4 4 4 4M6 12h9" {...stroke()} />
    </Svg>
  );
}
function IconTrash({ danger }: { danger?: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" {...stroke(danger)} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingTop: 4 },
  stitle: {
    color: colors.w45,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 0.7,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  group: {
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: "hidden",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  itemLast: { borderBottomWidth: 0 },
  ic: {
    width: 30,
    height: 30,
    borderRadius: radius.base,
    backgroundColor: colors.chrome3,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTitle: { color: colors.white, fontSize: 14, flex: 1 },
  itemSub: { color: colors.w45, fontSize: 11.5, marginTop: 2 },
  idInput: { flex: 1, color: colors.white, fontSize: 14, padding: 0 },
  saveRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  // flexShrink: 長めのエラー文言でも保存ボタンを押し出さず折り返す。
  note: { color: colors.w70, fontSize: 12, flexShrink: 1, marginRight: 8 },
  billingNote: { color: colors.w70, fontSize: 12, paddingHorizontal: 16, marginBottom: 4 },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 9,
    paddingHorizontal: 16,
  },
  disabled: { opacity: 0.5 },
  saveText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  plan: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14 },
  pin: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  planName: { color: colors.white, fontSize: 15, fontWeight: "800" },
  planPrice: { color: colors.w45, fontSize: 11.5, marginTop: 2 },
  go: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  loginNote: { color: colors.w45, fontSize: 12, textAlign: "center", marginTop: 12 },
  // ゲスト向けのサインイン導線（設定画面の主ボタンと同系のアクセント）。
  signInBtn: {
    marginTop: 10,
    alignSelf: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  signInText: { color: "#16181d", fontWeight: "800", fontSize: 13.5 },
});
