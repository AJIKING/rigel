import type { Seat, Tile } from "@rigel/schema";
import { chiRunLabel, NUMS, SUITS, type MeldPick, type PickerSuit } from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../lib/theme";
import { BottomSheet, SheetCloseButton } from "../BottomSheet";
import { Chip } from "../Chip";
import { DangerButton } from "../DangerButton";
import { MiniTile } from "../MiniTile";
import { Segment } from "../Segment";

/** 捨て牌から鳴くときの選択状態（種別・鳴いた人・チーの並び）。KifuEditor が保持する。 */
export interface CallState {
  type: MeldPick | null;
  caller: Seat;
  chiRun: Tile[] | null;
}

const CALL_TYPE_LABELS: Record<MeldPick, string> = { chi: "チー", pon: "ポン", kan: "カン" };

/**
 * 牌ピッカー（下からのシート）。スート切替 + 牌グリッド。
 * 既存牌の編集時は「削除」、河の牌なら「リーチ/ツモ切り」トグルも出す。
 * 河の牌の編集では「この捨て牌を鳴く」導線（種別→鳴いた人→切った牌）も出す。
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
  call = null,
  callers = [],
  chiRuns = [],
  onCallChange,
  chi = null,
  onChiIndex,
  onClose,
}: {
  title: string;
  initialSuit?: PickerSuit;
  /** 河の牌を編集中のときのフラグ状態（それ以外は null）。 */
  discard?: {
    riichi: boolean;
    tsumogiri: boolean;
  } | null;
  canDelete?: boolean;
  onPick: (tile: Tile) => void;
  onDelete?: () => void;
  onToggleRiichi?: () => void;
  onToggleTsumogiri?: () => void;
  /** 捨て牌から鳴く選択状態（河の牌の編集時のみ非 null）。種別を選ぶと
   *  牌グリッドの選択が「鳴いた人がその後に切った牌」になる。 */
  call?: CallState | null;
  /** 鳴いた人の候補（捨て主以外の3席。ラベルは選手名優先で呼び出し側が組む）。 */
  callers?: { seat: Seat; label: string }[];
  /** チーの並び候補（鳴かれた牌を含む順子）。空なら並びチップを出さない。 */
  chiRuns?: Tile[][];
  onCallChange?: (next: CallState) => void;
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
            </>
          ) : null}
          {canDelete ? <DangerButton label="削除" onPress={() => onDelete?.()} /> : null}
        </View>
      ) : null}

      {/* 捨て牌から鳴く（種別→鳴いた人→切った牌）。鳴かれた牌・捨て主は開いている牌から決まる。 */}
      {call && onCallChange ? (
        <>
          <View style={styles.actions}>
            <Text style={styles.callLabel}>鳴き</Text>
            <Chip
              label="なし"
              on={call.type === null}
              onPress={() => onCallChange({ ...call, type: null, chiRun: null })}
            />
            {(["chi", "pon", "kan"] as const).map((t) => (
              <Chip
                key={t}
                label={CALL_TYPE_LABELS[t]}
                a11yLabel={`${CALL_TYPE_LABELS[t]}で鳴く`}
                on={call.type === t}
                onPress={() => onCallChange({ ...call, type: t, chiRun: null })}
              />
            ))}
          </View>
          {call.type ? (
            <>
              <View style={styles.actions}>
                <Text style={styles.callLabel}>鳴いた人</Text>
                {callers.map((c) => (
                  <Chip
                    key={c.seat}
                    label={c.label}
                    a11yLabel={`鳴いた人: ${c.label}`}
                    on={call.caller === c.seat}
                    onPress={() => onCallChange({ ...call, caller: c.seat })}
                  />
                ))}
              </View>
              {call.type === "chi" && chiRuns.length > 0 ? (
                <View style={styles.actions}>
                  <Text style={styles.callLabel}>並び</Text>
                  {chiRuns.map((run) => {
                    const key = run.join(",");
                    return (
                      <Chip
                        key={key}
                        label={chiRunLabel(run)}
                        on={call.chiRun?.join(",") === key}
                        onPress={() => onCallChange({ ...call, chiRun: run })}
                      />
                    );
                  })}
                </View>
              ) : null}
              <Text style={styles.callHint}>牌を選ぶと、鳴いた人がその後に切った牌になります</Text>
            </>
          ) : null}
        </>
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
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  callLabel: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  callHint: { color: colors.w45, fontSize: 10.5, textAlign: "center", marginTop: 10 },
});
