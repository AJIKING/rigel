import {
  checkoutErrorMessage,
  planLabel,
  planMonthlyPriceAppStore,
  upgradeTargets,
  type PaidPlan,
  type Plan,
} from "@rigel/ui";
import { useIAP, type Purchase } from "expo-iap";
import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AppBar } from "../components/AppBar";
import { PlanSheet } from "../components/PlanSheet";
import {
  createCheckout,
  createPortal,
  deleteAccount,
  redeemAppStorePurchase,
  updateProfile,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { IAP_PRODUCT_IDS, IAP_SKUS } from "../lib/iap";
import { colors, radius } from "../lib/theme";

// 決済（外部ブラウザ）から戻る先。web の設定ページ（本番ドメイン）。
// TODO(deep-link): アプリへ直接戻すならユニバーサルリンク/カスタムスキームを設定する。
const BILLING_RETURN_URL = "https://rigel.plaria.co.jp/settings";

// アプリは App Store（アプリ内課金）経由の販売のため、手数料込み価格を表示する。
function priceLabel(plan: Plan): string {
  return plan === "free" ? "無料" : `¥${planMonthlyPriceAppStore(plan).toLocaleString()} / 月`;
}

export function SettingsScreen() {
  const { user, token, signOut, refresh } = useAuth();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delArm, setDelArm] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHandle(user.handle ?? "");
    setDisplayName(user.displayName ?? "");
    setProfilePublic(user.profilePublic ?? true);
  }, [user]);

  const plan: Plan = user?.plan ?? "free";
  const targets = token ? upgradeTargets(plan) : [];

  // IAP（App Store）。iOS の実売はアプリ内課金で行う（外部決済リンクは審査で不可）。
  // 購入成立は onPurchaseSuccess で受け、JWS を api で検証してからトランザクションを閉じる。
  const { connected, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: (purchase) => void onIapPurchase(purchase),
    onPurchaseError: (e) => {
      // ユーザーキャンセルはノイズなので黙る。それ以外だけ知らせる。
      if (!/cancel/i.test(String(e.code ?? ""))) setNote("購入に失敗しました");
    },
  });

  useEffect(() => {
    if (connected && Platform.OS === "ios") {
      void fetchProducts({ skus: IAP_SKUS, type: "subs" });
    }
  }, [connected, fetchProducts]);

  /** 購入成立 → api で JWS を検証しプラン反映 → 成功したときだけトランザクションを閉じる。 */
  async function onIapPurchase(purchase: Purchase) {
    if (!token) return;
    const jws = purchase.purchaseToken ?? "";
    const res = await redeemAppStorePurchase(token, { jws });
    if (res.ok) {
      await finishTransaction({ purchase, isConsumable: false });
      setNote(`プランを ${planLabel(res.plan)} に変更しました`);
      void refresh();
    } else {
      // 未 finish のまま残せば、次回起動時などに再度 onPurchaseSuccess が来て再試行できる。
      setNote("購入の検証に失敗しました。時間をおいて再度お試しください");
    }
  }

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

  async function onTogglePublic(next: boolean) {
    setProfilePublic(next);
    if (!token) return;
    // 保存に失敗したらトグルを元に戻す（プライバシー設定が未保存のまま見えてしまうのを防ぐ）。
    try {
      const res = await updateProfile(token, { profilePublic: next });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setProfilePublic(!next);
      setNote("公開設定の保存に失敗しました");
    }
  }

  // シートで選んだプランを購入する（free → 有料の新規加入のみ。加入中は onOpenPortal）。
  // iOS は IAP（App Store）で購入。それ以外（Android/dev）は Play Billing 対応まで暫定で
  // Stripe Checkout を開く。
  async function onSelectPlan(plan: PaidPlan) {
    setPlanOpen(false);
    if (!token) return;
    setNote(null);

    if (Platform.OS === "ios") {
      try {
        // 結果は onPurchaseSuccess / onPurchaseError で受ける。
        await requestPurchase({
          request: {
            apple: {
              sku: IAP_PRODUCT_IDS[plan],
              // 検証前に自動で閉じない（api の検証が通ってから finishTransaction する）。
              andDangerouslyFinishTransactionAutomatically: false,
            },
          },
          type: "subs",
        });
      } catch {
        // キャンセル等は onPurchaseError 側で処理される。
      }
      return;
    }

    try {
      const res = await createCheckout(token, {
        plan,
        successUrl: BILLING_RETURN_URL,
        cancelUrl: BILLING_RETURN_URL,
      });
      if (res.ok) await Linking.openURL(res.url);
      else setNote(checkoutErrorMessage(res.status));
    } catch {
      setNote("通信に失敗しました。");
    }
  }

  // 加入中のプラン変更・解約は決済ポータルで行う（Checkout の作り直しは二重課金になる）。
  async function onOpenPortal() {
    if (!token) return;
    setNote(null);
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
    if (!delArm) {
      setDelArm(true);
      setTimeout(() => setDelArm(false), 3000);
      return;
    }
    if (token) {
      const res = await deleteAccount(token);
      if (res.ok) signOut();
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

        <SectionTitle>公開設定</SectionTitle>
        <Group>
          <Item icon={<IconGlobe />} last>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>プロフィールを公開する</Text>
              <Text style={styles.itemSub}>公開牌譜からプロフィールを表示</Text>
            </View>
            <Switch
              value={profilePublic}
              onValueChange={(v) => void onTogglePublic(v)}
              trackColor={{ false: colors.chrome3, true: colors.accent }}
              thumbColor="#fff"
              accessibilityLabel="プロフィールを公開する"
            />
          </Item>
        </Group>

        <SectionTitle>アカウント</SectionTitle>
        <Group>
          <Pressable onPress={() => signOut()}>
            <Item icon={<IconLogout />}>
              <Text style={styles.itemTitle}>ログアウト</Text>
              <Chevron />
            </Item>
          </Pressable>
          <Pressable onPress={() => void onDelete()}>
            <Item icon={<IconTrash danger />} last>
              <Text style={[styles.itemTitle, { color: colors.vermilion }]}>
                {delArm ? "もう一度押すと削除されます" : "アカウントを削除"}
              </Text>
              <Chevron danger />
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
function IconGlobe() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} {...stroke()} />
      <Path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" {...stroke()} />
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
