import type { Tile } from "@rigel/schema";
import { NUMS, SUITS, type PickerSuit } from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import { BottomSheet, SheetCloseButton } from "../BottomSheet";
import { Chip } from "../Chip";
import { DangerButton } from "../DangerButton";
import { MiniTile } from "../MiniTile";
import { Segment } from "../Segment";

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
              <Chip label="リーチ" on={discard.riichi} onPress={() => onToggleRiichi?.()} />
              <Chip label="ツモ切り" on={discard.tsumogiri} onPress={() => onToggleTsumogiri?.()} />
            </>
          ) : null}
          {canDelete ? <DangerButton label="削除" onPress={() => onDelete?.()} /> : null}
        </View>
      ) : null}

      <SheetCloseButton onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 10 },
  tabs: { flexDirection: "row", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  cell: { padding: 2 },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
