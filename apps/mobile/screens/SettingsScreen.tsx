import {
  planLabel,
  planMonthlyPriceAppStore,
  upgradeTargets,
  type PaidPlan,
  type Plan,
} from "@rigel/ui";
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

// アプリは App Store（アプリ内課金）経由の販売のため、手数料込み価格を表示する。
function priceLabel(plan: Plan): string {
  return plan === "free" ? "無料" : `¥${planMonthlyPriceAppStore(plan).toLocaleString()} / 月`;
}

export function SettingsScreen() {
  const { user, token, signOut, refresh } = useAuth();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [note, setNote] = useState<string | null>(null);
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
    setNote(null);

    const outcome = await purchasePlan(plan);
    if (outcome === "purchased") {
      // plan 反映はサーバ側（RevenueCat Webhook → users.plan）経由のため数秒遅れることがある。
      setNote("購入ありがとうございます。プランを反映しています…（数秒かかることがあります）");
      void refresh();
    } else if (outcome === "failed") {
      setNote("購入に失敗しました");
    } else if (outcome === "unavailable") {
      setNote("アプリ内購入は現在利用できません");
    }
    // cancelled はユーザーの意思なので黙る。
  }

  // 加入中のプラン変更・解約。ストア購読（IAP）は OS の購読管理（RevenueCat の管理URL）へ、
  // web 購入（Stripe）は決済ポータルへ（Checkout の作り直しは二重課金になる）。
  async function onOpenPortal() {
    if (!token) return;
    setNote(null);
    const managementUrl = await purchasesManagementUrl();
    if (managementUrl) {
      await Linking.openURL(managementUrl).catch(() => setNote("購読管理を開けませんでした"));
      return;
    }
    try {
      const res = await createPortal(token, { returnUrl: BILLING_RETURN_URL });
      if (res.ok) await Linking.openURL(res.url);
      else
        setNote(
          res.status === 404
            ? "加入中のプランが見つかりませんでした"
            : "ポータルを開けませんでした",
        );
    } catch {
      setNote("通信に失敗しました。");
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
          {note ? <Text style={styles.note}>{note}</Text> : <View />}
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
              <Text style={styles.planPrice}>{priceLabel(plan)}</Text>
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

        <SectionTitle>アカウント</SectionTitle>
        <Group>
          <Pressable onPress={() => signOut()}>
            <Item icon={<IconLogout />}>
              <Text style={styles.itemTitle}>ログアウト</Text>
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
                  <Text style={styles.itemSub}>有料プラン契約中は不可（先に解約してください）</Text>
                ) : null}
              </View>
              {plan === "free" ? <Chevron danger /> : null}
            </Item>
          </Pressable>
        </Group>

        {!token ? <Text style={styles.loginNote}>設定の保存にはログインが必要です。</Text> : null}
      </View>

      {/* プラン変更: 下からのシートで選択（アプリは App Store 価格 = 手数料込み）。 */}
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
  note: { color: colors.w70, fontSize: 12 },
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
});
