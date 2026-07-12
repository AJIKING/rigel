import type { Players, Seat } from "@rigel/schema";
import {
  playersFromInput,
  playersToInput,
  seatLabel,
  SEAT_ORDER,
  type PlayersInput,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { BottomSheet } from "../BottomSheet";

/**
 * 選手情報（選手名・リーグ戦ポイント）の編集シート（web エディタの「ポイント」欄と同等）。
 * リーグ戦などの積み上げポイント状況は打牌判断の前提になるため半荘単位で記録し、
 * 再生画面のネームプレートに表示される。保存で onSave に Players（全席空なら null）を返す。
 */
export function PlayersSheet({
  players,
  onSave,
  onClose,
}: {
  players: Players | null;
  onSave: (players: Players | null) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<PlayersInput>(() => playersToInput(players));

  const set = (seat: Seat, patch: Partial<PlayersInput[Seat]>) =>
    setDraft((d) => ({ ...d, [seat]: { ...d[seat], ...patch } }));

  return (
    <BottomSheet onClose={onClose} maxHeight="90%">
      <Text style={styles.title}>選手情報</Text>
      <Text style={styles.desc}>
        選手名とリーグ戦などの持ちポイントを記録します（再生画面に表示。半荘の全局で共通）。
      </Text>

      {SEAT_ORDER.map((seat) => {
        const label = `${seatLabel(seat)}家`;
        return (
          <View key={seat} style={styles.row}>
            <Text style={styles.seat}>{label}</Text>
            <TextInput
              style={styles.name}
              value={draft[seat].name}
              placeholder={label}
              placeholderTextColor={colors.w45}
              maxLength={20}
              accessibilityLabel={`${label}の選手名`}
              onChangeText={(v) => set(seat, { name: v })}
            />
            <TextInput
              style={styles.pts}
              value={draft[seat].points}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel={`${label}のポイント`}
              onChangeText={(v) => set(seat, { points: v })}
            />
          </View>
        );
      })}

      <View style={styles.foot}>
        <Pressable style={styles.ghost} onPress={onClose} accessibilityRole="button">
          <Text style={styles.ghostText}>キャンセル</Text>
        </Pressable>
        <Pressable
          style={styles.primary}
          onPress={() => onSave(playersFromInput(draft))}
          accessibilityRole="button"
          accessibilityLabel="選手情報を保存"
        >
          <Text style={styles.primaryText}>保存</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 4 },
  desc: { color: colors.w45, fontSize: 11.5, marginBottom: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  seat: { color: colors.w70, fontSize: 13, fontWeight: "800", width: 40 },
  name: {
    flex: 1,
    color: colors.white,
    fontSize: 14,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  pts: {
    width: 84,
    color: colors.accent,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "right",
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
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
