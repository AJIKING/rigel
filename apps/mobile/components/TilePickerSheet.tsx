import type { Tile } from "@rigel/schema";
import { NUMS, SUITS, type PickerSuit } from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { BottomSheet, SheetCloseButton } from "./BottomSheet";
import { MiniTile } from "./MiniTile";
import { Segment } from "./Segment";

/**
 * 牌ピッカー（下からのシート）。スート切替 + 牌グリッド。
 * 既存牌の編集時は「削除」、河の牌なら「リーチ/ツモ切り」トグルも出す。
 */
export function TilePickerSheet({
  title,
  initialSuit = "m",
  discard,
  canDelete = false,
  onPick,
  onDelete,
  onToggleRiichi,
  onToggleTsumogiri,
  onClose,
}: {
  title: string;
  initialSuit?: PickerSuit;
  /** 河の牌を編集中のときのフラグ状態（それ以外は null）。 */
  discard?: { riichi: boolean; tsumogiri: boolean } | null;
  canDelete?: boolean;
  onPick: (tile: Tile) => void;
  onDelete?: () => void;
  onToggleRiichi?: () => void;
  onToggleTsumogiri?: () => void;
  onClose: () => void;
}) {
  const [suit, setSuit] = useState<PickerSuit>(initialSuit);

  return (
    <BottomSheet onClose={onClose}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.tabs}>
        <Segment
          options={SUITS.map((s) => [s.suit, s.label] as const)}
          value={suit}
          onChange={setSuit}
        />
      </View>

      <View style={styles.grid}>
        {/* ラベルは MiniTile 自身が持つ（Pressable 側にも付けると重複する）。 */}
        {NUMS[suit].map((code) => (
          <Pressable key={code} onPress={() => onPick(code)} style={styles.cell}>
            <MiniTile code={code} w={34} h={46} />
          </Pressable>
        ))}
      </View>

      {discard || canDelete ? (
        <View style={styles.actions}>
          {discard ? (
            <>
              <ActionToggle
                label="リーチ"
                active={discard.riichi}
                onPress={() => onToggleRiichi?.()}
              />
              <ActionToggle
                label="ツモ切り"
                active={discard.tsumogiri}
                onPress={() => onToggleTsumogiri?.()}
              />
            </>
          ) : null}
          {canDelete ? (
            <Pressable
              style={styles.delete}
              onPress={() => onDelete?.()}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>削除</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <SheetCloseButton onPress={onClose} />
    </BottomSheet>
  );
}

function ActionToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.tog, active && styles.togOn]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.togText, active && styles.togTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  tabs: { flexDirection: "row", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  cell: { padding: 2 },
  actions: { flexDirection: "row", gap: 8, marginTop: 14, justifyContent: "center" },
  tog: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
    alignItems: "center",
    justifyContent: "center",
  },
  togOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  togText: { color: colors.w70, fontWeight: "800", fontSize: 13 },
  togTextOn: { color: colors.accent },
  delete: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.vermilion,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteText: { color: colors.vermilion, fontWeight: "800", fontSize: 13 },
});
