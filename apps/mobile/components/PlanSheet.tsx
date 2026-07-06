import { planLabel, planMonthlyPriceAppStore, PLAN_FEATURES, type PaidPlan } from "@rigel/ui";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";

/**
 * プラン変更のボトムシート。各プランの提供内容（PLAN_FEATURES）と月額を並べ、
 * 選んで onSelect に渡す。アプリは App Store（アプリ内課金）経由の販売になるため、
 * 価格は手数料込みの planMonthlyPriceAppStore（30%割増）を表示する（web の価格とは異なる）。
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

      <Text style={styles.note}>
        価格は App Store 手数料を含みます。サブスクリプションはいつでも解約できます。
      </Text>
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
  note: { color: colors.w45, fontSize: 11, marginTop: 4 },
});
