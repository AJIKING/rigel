import { planLabel, planMonthlyPriceAppStore, type PaidPlan } from "@rigel/ui";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";

/**
 * プラン変更のボトムシート。アップグレード先を選んで onSelect に渡す。
 * アプリは App Store（アプリ内課金）経由の販売になるため、価格は手数料込みの
 * planMonthlyPriceAppStore（30%割増）を表示する（web の価格とは異なる）。
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
    <BottomSheet onClose={onClose}>
      <Text style={styles.title}>プランを変更</Text>

      {targets.map((plan) => (
        <Pressable
          key={plan}
          style={styles.row}
          onPress={() => onSelect(plan)}
          accessibilityRole="button"
          accessibilityLabel={`${planLabel(plan)} を選ぶ`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{planLabel(plan)}</Text>
            <Text style={styles.price}>
              ¥{planMonthlyPriceAppStore(plan).toLocaleString()} / 月
            </Text>
          </View>
          <Text style={styles.pick}>選ぶ ›</Text>
        </Pressable>
      ))}

      <Text style={styles.note}>価格は App Store 手数料を含みます。</Text>
      <SheetCloseButton onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 8,
  },
  name: { color: colors.white, fontSize: 15, fontWeight: "800" },
  price: { color: colors.accent, fontSize: 12.5, fontWeight: "700", marginTop: 2 },
  pick: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  note: { color: colors.w45, fontSize: 11, marginTop: 4 },
});
