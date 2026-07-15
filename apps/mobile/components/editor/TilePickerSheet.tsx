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
  onToggleCalledBy,
  chi = null,
  onChiIndex,
  onClose,
}: {
  title: string;
  initialSuit?: PickerSuit;
  /** 河の牌を編集中のときのフラグ状態（それ以外は null）。
   *  calledLabel/calledOn は「鳴かれた」チップの表示（ラベルは呼び出し側が席名つきで組む）。 */
  discard?: {
    riichi: boolean;
    tsumogiri: boolean;
    calledOn?: boolean;
    calledLabel?: string;
  } | null;
  canDelete?: boolean;
  onPick: (tile: Tile) => void;
  onDelete?: () => void;
  onToggleRiichi?: () => void;
  onToggleTsumogiri?: () => void;
  /** 「鳴かれた」チップの順送り（なし→下家→対面→上家→なし）。 */
  onToggleCalledBy?: () => void;
  /** チー追加時の並び（選んだ牌を 0=左端/1=中央/2=右端 に置く）。null なら並びチップを出さない。 */
  chi?: { index: 0 | 1 | 2 } | null;
  onChiIndex?: (index: 0 | 1 | 2) => void;
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

      {chi ? (
        <View style={styles.actions}>
          {/* 選んだ牌を順子のどこに置くか（例: 7筒で右端→567、中央→678、左端→789）。 */}
          <Chip label="左端" on={chi.index === 0} onPress={() => onChiIndex?.(0)} />
          <Chip label="中央" on={chi.index === 1} onPress={() => onChiIndex?.(1)} />
          <Chip label="右端" on={chi.index === 2} onPress={() => onChiIndex?.(2)} />
        </View>
      ) : null}

      {discard || canDelete ? (
        <View style={styles.actions}>
          {discard ? (
            <>
              {/* リーチは牌譜の河のみ（何切るの河には無い）。ハンドラの有無で出し分ける。 */}
              {onToggleRiichi ? (
                <Chip label="リーチ" on={discard.riichi} onPress={() => onToggleRiichi()} />
              ) : null}
              <Chip label="ツモ切り" on={discard.tsumogiri} onPress={() => onToggleTsumogiri?.()} />
              {discard.calledLabel ? (
                <Chip
                  label={discard.calledLabel}
                  on={discard.calledOn ?? false}
                  onPress={() => onToggleCalledBy?.()}
                />
              ) : null}
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
