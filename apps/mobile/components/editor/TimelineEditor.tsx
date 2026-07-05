import {
  KifuSchema,
  type Kifu,
  type Meld,
  type MeldType,
  type Seat,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import {
  deriveTimeline,
  seatLabel,
  syncSeatsFromTimeline,
  timelineTurns,
  SEAT_ORDER,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { MiniTile } from "../MiniTile";
import { TilePickerSheet } from "./TilePickerSheet";

const MELD_TYPES: MeldType[] = ["pon", "chi", "kan_open", "kan_closed", "kan_added"];
const MELD_LABEL: Record<MeldType, string> = {
  pon: "ポン",
  chi: "チー",
  kan_open: "大明槓",
  kan_closed: "暗槓",
  kan_added: "加槓",
};
const isKan = (t: MeldType) => t === "kan_open" || t === "kan_closed" || t === "kan_added";
const nextSeat = (seat: Seat): Seat => SEAT_ORDER[(SEAT_ORDER.indexOf(seat) + 1) % 4]!;
const nextFrom = (from: Seat | null, self: Seat): Seat => {
  let i = SEAT_ORDER.indexOf(from ?? self);
  do {
    i = (i + 1) % 4;
  } while (SEAT_ORDER[i] === self);
  return SEAT_ORDER[i]!;
};

/** ピッカーの対象（打牌のツモ/捨て、または鳴き牌）。 */
type Pick =
  | { kind: "draw"; index: number }
  | { kind: "disc"; index: number }
  | { kind: "mtile"; index: number; ti: number }
  | null;

/**
 * 手順（タイムライン）エディタ（モバイル）。打牌・鳴きを時系列で並べ、席・牌・
 * 手出し/ツモ切り・リーチをタップ編集、上下ボタンで順番入替する。timeline を正典として
 * 盤面(席ごと)へ同期し onChange で返す。ロジックは @rigel/ui の共有ヘルパ。web の
 * TimelineEditor と同等（並替はドラッグの代わりに上下移動）。
 */
export function TimelineEditor({
  kifu,
  dealer,
  onChange,
}: {
  kifu: Kifu;
  dealer: Seat;
  onChange: (kifu: Kifu) => void;
}) {
  const timeline = deriveTimeline(kifu);
  const turns = timelineTurns(timeline, dealer);
  const [pick, setPick] = useState<Pick>(null);

  /** 新しい timeline を正典にして盤面を同期し、親へ返す。 */
  function commit(next: TimelineEvent[]) {
    onChange(syncSeatsFromTimeline(KifuSchema.parse({ ...kifu, timeline: next })));
  }
  function update(index: number, fn: (e: TimelineEvent) => TimelineEvent) {
    commit(timeline.map((e, i) => (i === index ? fn(e) : e)));
  }
  function updateMeld(index: number, fn: (m: Meld) => Meld) {
    update(index, (e) => (e.kind === "meld" ? { ...e, meld: fn(e.meld) } : e));
  }
  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= timeline.length) return;
    const next = timeline.slice();
    [next[index], next[to]] = [next[to]!, next[index]!];
    commit(next);
  }

  function onPick(code: Tile) {
    if (!pick) return;
    const t = pick;
    update(t.index, (e) => {
      if (e.kind === "discard") {
        if (t.kind === "draw") return { ...e, draw: code, tile: e.tsumogiri ? code : e.tile };
        if (t.kind === "disc") return { ...e, tile: code };
        return e;
      }
      if (t.kind === "mtile") {
        const tiles = e.meld.tiles.map((rt, i) => (i === t.ti ? { ...rt, tile: code } : rt));
        return { ...e, meld: { ...e.meld, tiles } };
      }
      return e;
    });
    setPick(null);
  }

  function addDiscard() {
    commit([
      ...timeline,
      {
        kind: "discard",
        seat: dealer,
        draw: null,
        tile: null,
        tsumogiri: false,
        riichi: false,
        confidence: 1,
      },
    ]);
  }
  function addMeld() {
    const meld: Meld = {
      type: "pon",
      tiles: [
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
      ],
      from: nextFrom(null, dealer),
    };
    commit([...timeline, { kind: "meld", seat: dealer, meld }]);
  }

  return (
    <View>
      <View style={styles.head}>
        <Text style={styles.hint}>席・牌・手出し/ツモ切りはタップ、順番は上下で入替。</Text>
        <View style={styles.addRow}>
          <Pressable style={styles.addBtn} onPress={addDiscard} accessibilityRole="button">
            <Text style={styles.addText}>＋打牌</Text>
          </Pressable>
          <Pressable style={styles.addBtn} onPress={addMeld} accessibilityRole="button">
            <Text style={styles.addText}>＋鳴き</Text>
          </Pressable>
        </View>
      </View>

      {timeline.length === 0 ? (
        <Text style={styles.empty}>まだ手順がありません。「＋打牌」で追加してください。</Text>
      ) : null}

      {timeline.map((e, i) => (
        <View key={i}>
          {e.kind === "discard" && e.seat === dealer ? (
            <Text style={styles.turn}>{turns[i]}巡目</Text>
          ) : null}
          <View style={[styles.row, e.kind === "meld" && styles.meldRow]}>
            <Pressable
              style={styles.seat}
              onPress={() => update(i, (x) => ({ ...x, seat: nextSeat(x.seat) }))}
              accessibilityRole="button"
              accessibilityLabel="席を変更"
            >
              <Text style={styles.seatText}>{seatLabel(e.seat)}</Text>
            </Pressable>

            {e.kind === "discard" ? (
              <>
                <TileSlot
                  label="ツモ"
                  code={e.draw}
                  a11y="ツモ牌を選ぶ"
                  onPress={() => setPick({ kind: "draw", index: i })}
                />
                <TileSlot
                  label="打"
                  code={e.tile}
                  a11y="打牌を選ぶ"
                  disabled={e.tsumogiri}
                  onPress={() => setPick({ kind: "disc", index: i })}
                />
                <Pressable
                  style={[styles.mode, e.tsumogiri ? styles.tsumogiri : styles.tegiri]}
                  onPress={() =>
                    update(i, (x) =>
                      x.kind === "discard"
                        ? { ...x, tsumogiri: !x.tsumogiri, tile: !x.tsumogiri ? x.draw : x.tile }
                        : x,
                    )
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.modeText}>{e.tsumogiri ? "ツモ切り" : "手出し"}</Text>
                </Pressable>
                <Pressable
                  style={[styles.riichi, e.riichi && styles.riichiOn]}
                  onPress={() =>
                    update(i, (x) => (x.kind === "discard" ? { ...x, riichi: !x.riichi } : x))
                  }
                  accessibilityRole="button"
                >
                  <Text style={[styles.riichiText, e.riichi && styles.riichiTextOn]}>リーチ</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={styles.kind}
                  onPress={() =>
                    updateMeld(i, (m) => {
                      const type = MELD_TYPES[(MELD_TYPES.indexOf(m.type) + 1) % 5]!;
                      const n = isKan(type) ? 4 : 3;
                      const tiles = Array.from(
                        { length: n },
                        (_, k) => m.tiles[k] ?? m.tiles[0] ?? { tile: null, confidence: 1 },
                      );
                      const from =
                        type === "kan_closed" ? null : (m.from ?? nextFrom(null, e.seat));
                      return { type, tiles, from };
                    })
                  }
                  accessibilityRole="button"
                >
                  <Text style={styles.kindText}>{MELD_LABEL[e.meld.type]}</Text>
                </Pressable>
                <View style={styles.mtiles}>
                  {e.meld.tiles.map((rt, ti) => (
                    <Pressable
                      key={ti}
                      onPress={() => setPick({ kind: "mtile", index: i, ti })}
                      accessibilityRole="button"
                      accessibilityLabel={`鳴き牌${ti + 1}を選ぶ`}
                    >
                      <MiniTile code={rt.tile} w={20} h={28} />
                    </Pressable>
                  ))}
                </View>
                {e.meld.type !== "kan_closed" ? (
                  <Pressable
                    style={styles.from}
                    onPress={() => updateMeld(i, (m) => ({ ...m, from: nextFrom(m.from, e.seat) }))}
                    accessibilityRole="button"
                  >
                    <Text style={styles.fromText}>
                      {seatLabel(e.meld.from ?? nextFrom(null, e.seat))}から
                    </Text>
                  </Pressable>
                ) : null}
              </>
            )}

            <View style={styles.spacer} />
            <Pressable
              style={styles.iconBtn}
              onPress={() => move(i, -1)}
              disabled={i === 0}
              accessibilityRole="button"
              accessibilityLabel="上へ移動"
            >
              <Text style={[styles.icon, i === 0 && styles.iconOff]}>▲</Text>
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => move(i, 1)}
              disabled={i === timeline.length - 1}
              accessibilityRole="button"
              accessibilityLabel="下へ移動"
            >
              <Text style={[styles.icon, i === timeline.length - 1 && styles.iconOff]}>▼</Text>
            </Pressable>
            <Pressable
              style={styles.iconBtn}
              onPress={() => commit(timeline.filter((_, k) => k !== i))}
              accessibilityRole="button"
              accessibilityLabel="削除"
            >
              <Text style={styles.del}>✕</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {pick ? (
        <TilePickerSheet title="牌を選ぶ" onPick={onPick} onClose={() => setPick(null)} />
      ) : null}
    </View>
  );
}

function TileSlot({
  label,
  code,
  a11y,
  disabled,
  onPress,
}: {
  label: string;
  code: Tile | null;
  a11y: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.slot, disabled && styles.slotOff]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.slotLabel}>{label}</Text>
      <MiniTile code={code} w={20} h={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8, marginBottom: 6 },
  hint: { color: colors.w45, fontSize: 11 },
  addRow: { flexDirection: "row", gap: 8 },
  addBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  addText: { color: colors.accent, fontWeight: "800", fontSize: 13 },
  empty: { color: colors.w45, fontSize: 12, paddingVertical: 10 },
  turn: { color: colors.w45, fontSize: 11, fontWeight: "800", marginTop: 8, marginBottom: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line2,
  },
  meldRow: { backgroundColor: "rgba(255,158,69,0.06)" },
  seat: {
    width: 30,
    height: 30,
    borderRadius: radius.base,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  seatText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  slot: { alignItems: "center", gap: 1 },
  slotOff: { opacity: 0.4 },
  slotLabel: { color: colors.w45, fontSize: 9 },
  mode: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  tegiri: { backgroundColor: colors.chrome2 },
  tsumogiri: { backgroundColor: colors.chrome3, opacity: 0.85 },
  modeText: { color: colors.w70, fontSize: 11, fontWeight: "700" },
  riichi: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  riichiOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  riichiText: { color: colors.w70, fontSize: 11, fontWeight: "700" },
  riichiTextOn: { color: colors.accent },
  kind: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  kindText: { color: colors.accent, fontSize: 11.5, fontWeight: "800" },
  mtiles: { flexDirection: "row", gap: 2 },
  from: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  fromText: { color: colors.w70, fontSize: 11, fontWeight: "700" },
  spacer: { flex: 1 },
  iconBtn: { width: 26, height: 30, alignItems: "center", justifyContent: "center" },
  icon: { color: colors.w70, fontSize: 12 },
  iconOff: { color: colors.line },
  del: { color: colors.vermilion, fontSize: 14, fontWeight: "800" },
});
