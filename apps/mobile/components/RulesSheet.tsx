import { RULE_PRESETS, type Rules } from "@rigel/schema";
import { matchPreset, RULES_FORM, RULE_PRESET_OPTIONS } from "@rigel/ui";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { BottomSheet } from "./BottomSheet";
import { Segment } from "./Segment";

/**
 * 半荘ルールの設定シート（web RulesDialog と同等）。プリセットで一括、
 * 個別トグル/セグメントで微調整し、保存で onSave にルールを返す。
 * 項目定義は @rigel/ui の RULES_FORM を共有する。
 */
export function RulesSheet({
  rules,
  onSave,
  onClose,
}: {
  rules: Rules;
  onSave: (rules: Rules) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Rules>(rules);
  const active = matchPreset(draft, RULE_PRESETS);

  return (
    <BottomSheet onClose={onClose} maxHeight="90%">
      <Text style={styles.title}>ルール設定</Text>

      {/* プリセット */}
      <View style={styles.presets}>
        {RULE_PRESET_OPTIONS.map((p) => (
          <Pressable
            key={p.key}
            style={[styles.preset, active === p.key && styles.presetOn]}
            onPress={() => setDraft(RULE_PRESETS[p.key])}
            accessibilityRole="button"
          >
            <Text style={[styles.presetText, active === p.key && styles.presetTextOn]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
        <View style={[styles.preset, active === "custom" && styles.presetOn, styles.presetDim]}>
          <Text style={[styles.presetText, active === "custom" && styles.presetTextOn]}>
            カスタム
          </Text>
        </View>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyInner}>
        {RULES_FORM.map((g) => (
          <View key={g.title} style={styles.group}>
            <Text style={styles.groupTitle}>{g.title}</Text>
            {g.rows.map((row) => (
              <View key={row.key} style={styles.row}>
                <View style={styles.rowLabel}>
                  <Text style={styles.rt}>{row.title}</Text>
                  <Text style={styles.rd}>{row.desc}</Text>
                </View>
                {row.kind === "toggle" ? (
                  <Switch
                    value={draft[row.key]}
                    onValueChange={(v) => setDraft((d) => ({ ...d, [row.key]: v }))}
                    trackColor={{ false: colors.chrome3, true: colors.accent }}
                    thumbColor="#fff"
                    accessibilityLabel={row.title}
                  />
                ) : (
                  <View style={styles.segWrap}>
                    <Segment
                      options={row.options}
                      value={String(draft[row.key])}
                      onChange={(v) => setDraft((d) => ({ ...d, [row.key]: v }))}
                      compact
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}
      </ScrollView>

      <View style={styles.foot}>
        <Pressable style={styles.ghost} onPress={onClose} accessibilityRole="button">
          <Text style={styles.ghostText}>キャンセル</Text>
        </Pressable>
        <Pressable
          style={styles.primary}
          onPress={() => onSave(draft)}
          accessibilityRole="button"
          accessibilityLabel="ルールを保存"
        >
          <Text style={styles.primaryText}>保存</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  preset: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  presetOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  presetDim: { opacity: 0.7 },
  presetText: { color: colors.w70, fontWeight: "800", fontSize: 12.5 },
  presetTextOn: { color: colors.accent },
  body: { maxHeight: 420 },
  bodyInner: { gap: 14, paddingBottom: 4 },
  group: { gap: 4 },
  groupTitle: { color: colors.w45, fontSize: 12, fontWeight: "800", marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  rowLabel: { flex: 1 },
  rt: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  rd: { color: colors.w45, fontSize: 11, marginTop: 2 },
  segWrap: { width: 170 },
  foot: { flexDirection: "row", gap: 10, marginTop: 14, justifyContent: "flex-end" },
  ghost: {
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghostText: { color: colors.w70, fontWeight: "700", fontSize: 13 },
  primary: {
    paddingVertical: 11,
    paddingHorizontal: 28,
    borderRadius: radius.base,
    backgroundColor: colors.accent,
  },
  primaryText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
});
