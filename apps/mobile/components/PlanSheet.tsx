import { planLabel, planMonthlyPriceAppStore, PLAN_FEATURES, type PaidPlan } from "@rigel/ui";
import * as WebBrowser from "expo-web-browser";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SITE_ORIGIN } from "../lib/site";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";

/**
 * プラン変更のボトムシート。各プランの提供内容（PLAN_FEATURES）と月額を並べ、
 * 選んで onSelect に渡す。アプリはストア（アプリ内課金）経由の販売のため、価格は
 * ストア掲載価格の planMonthlyPriceAppStore（Next ¥700 / Pro ¥1,800）を表示する
 * （web=Stripe の価格とは異なる。表示専用＝実際の請求はストア設定が正）。
 */
export function PlanSheet({
  targets,
  onSelect,
  onClose,
}: {
  targets: PaidPlan[];
  onSelect: (plan: PaidPlan) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet onClose={onClose} maxHeight="88%">
      <Text style={styles.title}>プランを変更</Text>

      <ScrollView>
        {targets.map((plan) => (
          <View key={plan} style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.name}>{planLabel(plan)}</Text>
              <Text style={styles.price}>
                ¥{planMonthlyPriceAppStore(plan).toLocaleString()}
                <Text style={styles.per}> / 月</Text>
              </Text>
            </View>
            {/* 提供内容（web のプランカードと共通の定義）。 */}
            <View style={styles.feats}>
              {PLAN_FEATURES[plan].map((f) => (
                <View key={f} style={styles.featRow}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={styles.feat}>{f}</Text>
                </View>
              ))}
            </View>
            <Pressable
              style={styles.pickBtn}
              onPress={() => onSelect(plan)}
              accessibilityRole="button"
              accessibilityLabel={`${planLabel(plan)} を選ぶ`}
            >
              <Text style={styles.pickText}>このプランにする</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {/* 自動更新の仕組みと規約リンクは購入画面に必須（App Store 3.1.2）。
          ストア名・手数料には触れない（iOS/Android で同じ画面を使う）。 */}
      {/* JSX テキストの改行は半角スペースになり和文の文中に隙間が出るため、文字列で持つ。 */}
      <Text style={styles.note}>
        {"サブスクリプションは1か月ごとの自動更新です。" +
          "解約しない限り自動的に更新され、解約はいつでも OS の購読設定から行えます。"}
      </Text>
      <View style={styles.links}>
        <Pressable
          onPress={() => void WebBrowser.openBrowserAsync(`${SITE_ORIGIN}/terms`)}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={styles.link}>利用規約</Text>
        </Pressable>
        <Pressable
          onPress={() => void WebBrowser.openBrowserAsync(`${SITE_ORIGIN}/privacy`)}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={styles.link}>プライバシーポリシー</Text>
        </Pressable>
      </View>
      <SheetCloseButton onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  card: {
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    marginBottom: 10,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  name: { color: colors.white, fontSize: 16, fontWeight: "800" },
  price: { color: colors.accent, fontSize: 16, fontWeight: "800" },
  per: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  feats: { marginTop: 10, gap: 6 },
  featRow: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  check: { color: colors.emLite, fontSize: 12, fontWeight: "800", lineHeight: 17 },
  feat: { color: colors.w70, fontSize: 12.5, lineHeight: 17, flex: 1 },
  pickBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 11,
    alignItems: "center",
  },
  pickText: { color: "#16181d", fontWeight: "800", fontSize: 13.5 },
  note: { color: colors.w45, fontSize: 11, marginTop: 4, lineHeight: 16 },
  links: { flexDirection: "row", gap: 16, marginTop: 6 },
  link: { color: colors.w70, fontSize: 11.5, textDecorationLine: "underline" },
});
