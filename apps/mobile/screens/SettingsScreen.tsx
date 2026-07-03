import {
  checkoutErrorMessage,
  planLabel,
  planMonthlyPrice,
  upgradeTargets,
  type Plan,
} from "@rigel/ui";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { AppBar } from "../components/AppBar";
import { createCheckout, deleteAccount, updateProfile } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

function priceLabel(plan: Plan): string {
  return plan === "free" ? "無料" : `¥${planMonthlyPrice(plan).toLocaleString()} / 月`;
}

export function SettingsScreen() {
  const { user, token, signOut } = useAuth();
  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [profilePublic, setProfilePublic] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [delArm, setDelArm] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHandle(user.handle ?? "");
    setDisplayName(user.displayName ?? "");
    setProfilePublic(user.profilePublic ?? true);
  }, [user]);

  const plan: Plan = user?.plan ?? "free";
  const targets = token ? upgradeTargets(plan) : [];

  async function onSaveProfile() {
    if (!token) return;
    setSaving(true);
    setNote(null);
    const res = await updateProfile(token, { handle, displayName });
    setSaving(false);
    if (res.ok) setNote("保存しました");
    else if (res.status === 409) setNote("そのIDは既に使われています");
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

  async function onChangePlan() {
    if (!token || targets.length === 0) return;
    setNote(null);
    try {
      const res = await createCheckout(token, {
        plan: targets[0],
        successUrl: "https://rigel.app/ok",
        cancelUrl: "https://rigel.app/ng",
      });
      if (res.ok) await Linking.openURL(res.url);
      else setNote(checkoutErrorMessage(res.status));
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
            {targets.length > 0 ? (
              <Pressable onPress={() => void onChangePlan()}>
                <Text style={styles.go}>変更 ›</Text>
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
