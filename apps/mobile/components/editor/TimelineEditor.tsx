import {
  KifuSchema,
  type Kifu,
  type Meld,
  type Seat,
  type Tile,
  type TimelineEvent,
} from "@rigel/schema";
import {
  calledByLabel,
  cycleEventSeat,
  cycleMeldFrom,
  cycleMeldType,
  deriveTimeline,
  makeDiscardEvent,
  moveTimelineRow,
  nextDiscardSeat,
  nextMeldFrom,
  otherSeats,
  removeTimelineRow,
  seatLabel,
  setMeldDiscard,
  setTimelineCall,
  syncSeatsFromTimeline,
  timelineRows,
  timelineTurns,
  MELD_TYPE_LABELS,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { BottomSheet } from "../BottomSheet";
import { Chip } from "../Chip";
import { MiniTile } from "../MiniTile";
import { TilePickerSheet } from "./TilePickerSheet";

/** ピッカーの対象（打牌のツモ/捨て、鳴き牌、鳴き行に併合された嶺上ツモ/切った牌）。 */
type Pick =
  | { kind: "draw"; index: number }
  | { kind: "disc"; index: number }
  | { kind: "mtile"; index: number; ti: number }
  | { kind: "mdraw"; index: number }
  | { kind: "mdisc"; index: number }
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
  // 表示行: 鳴き行は直後の「鳴いた人の打牌」を併合して1行にする（共有ロジック。web と同一）。
  const rows = timelineRows(timeline);
  const [pick, setPick] = useState<Pick>(null);
  // 「鳴き」メニューを開いている打牌行（鳴いた人を選ぶ。null=閉）。
  const [callPick, setCallPick] = useState<number | null>(null);

  /** 席の表示名（選手名を優先。無名は「南家」のような席名）。 */
  const seatName = (s: Seat) => kifu.players?.[s]?.name || `${seatLabel(s)}家`;

  /** 鳴き行に併合された「鳴いた人の打牌」（直後・同席）。無ければ null。 */
  function meldDiscardOf(meldIndex: number) {
    const m = timeline[meldIndex];
    const d = timeline[meldIndex + 1];
    return m?.kind === "meld" && d?.kind === "discard" && d.seat === m.seat ? d : null;
  }

  /** 新しい timeline を正典にして盤面を同期し、親へ返す。 */
  function commit(next: TimelineEvent[]) {
    onChange(syncSeatsFromTimeline(KifuSchema.parse({ ...kifu, timeline: next })));
  }
  function update(index: number, fn: (e: TimelineEvent) => TimelineEvent) {
    commit(timeline.map((e, i) => (i === index ? fn(e) : e)));
  }
  /** 行単位の移動（鳴き行は併合した打牌ごと動く）。rowIndex は表示行の位置。 */
  function move(rowIndex: number, dir: -1 | 1) {
    const to = rowIndex + dir;
    if (to < 0 || to >= rows.length) return;
    commit(moveTimelineRow(timeline, rows, rowIndex, to));
  }

  function onPick(code: Tile) {
    if (!pick) return;
    const t = pick;
    // 鳴き行の「嶺上/打」は併合された打牌へ書く（無ければ直後に挿入＝共有純関数）。
    if (t.kind === "mdraw" || t.kind === "mdisc") {
      commit(
        setMeldDiscard(timeline, t.index, t.kind === "mdraw" ? { draw: code } : { tile: code }),
      );
      setPick(null);
      return;
    }
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
    // 追加席は東南西北×巡目を順に埋める（必ず新巡目・東にならないように）。
    commit([...timeline, makeDiscardEvent(nextDiscardSeat(timeline, dealer))]);
  }
  function addMeld() {
    const meld: Meld = {
      type: "pon",
      tiles: [
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
        { tile: null, confidence: 1 },
      ],
      from: nextMeldFrom(null, dealer),
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

      {rows.map((row, ri) => {
        const e = row.event;
        const i = row.index;
        // 鳴き行に併合された「鳴いた人の打牌」（切った牌・嶺上ツモ）。
        const md = e.kind === "meld" ? meldDiscardOf(i) : null;
        const isKan = e.kind === "meld" && e.meld.type.startsWith("kan");
        return (
          <View key={ri}>
            {/* 巡目見出しは「先頭」または「巡目が変わる位置」に出す。親の打牌位置基準だと
              並替で親の打牌より上に行が来たとき「1巡目より前」に見える領域ができるため。 */}
            {ri === 0 || turns[i] !== turns[rows[ri - 1]!.index] ? (
              <Text style={styles.turn}>{turns[i]}巡目</Text>
            ) : null}
            <View style={[styles.row, e.kind === "meld" && styles.meldRow]}>
              <Pressable
                style={styles.seat}
                onPress={() => commit(cycleEventSeat(timeline, i))}
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
                  {/* この捨て牌を誰が鳴いたか。メニューで鳴いた人を選ぶと、鳴き行と
                    「鳴いた人が切った牌」の行が直後に入る（河は薄表示になる）。 */}
                  <Pressable
                    style={[styles.riichi, e.calledBy != null && styles.riichiOn]}
                    onPress={() => setCallPick(i)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.riichiText, e.calledBy != null && styles.riichiTextOn]}>
                      {calledByLabel(
                        e.calledBy,
                        e.calledBy ? kifu.players?.[e.calledBy]?.name : null,
                      )}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Pressable
                    style={styles.kind}
                    onPress={() => commit(cycleMeldType(timeline, i))}
                    accessibilityRole="button"
                  >
                    <Text style={styles.kindText}>{MELD_TYPE_LABELS[e.meld.type]}</Text>
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
                      onPress={() => commit(cycleMeldFrom(timeline, i))}
                      accessibilityRole="button"
                    >
                      <Text style={styles.fromText}>
                        {seatName(e.meld.from ?? nextMeldFrom(null, e.seat))}から
                      </Text>
                    </Pressable>
                  ) : null}
                  {/* 鳴いた人がその後に切る牌を同じ行で編集する（カンは嶺上ツモも）。
                    併合対象が無ければ選んだ時点で直後に挿入される。 */}
                  {isKan ? (
                    <TileSlot
                      label="嶺上"
                      code={md?.draw ?? null}
                      a11y="嶺上ツモを選ぶ"
                      onPress={() => setPick({ kind: "mdraw", index: i })}
                    />
                  ) : null}
                  <TileSlot
                    label="打"
                    code={md?.tile ?? null}
                    a11y="切った牌を選ぶ"
                    onPress={() => setPick({ kind: "mdisc", index: i })}
                  />
                </>
              )}

              <View style={styles.spacer} />
              <Pressable
                style={styles.iconBtn}
                onPress={() => move(ri, -1)}
                disabled={ri === 0}
                accessibilityRole="button"
                accessibilityLabel="上へ移動"
              >
                <Text style={[styles.icon, ri === 0 && styles.iconOff]}>▲</Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => move(ri, 1)}
                disabled={ri === rows.length - 1}
                accessibilityRole="button"
                accessibilityLabel="下へ移動"
              >
                <Text style={[styles.icon, ri === rows.length - 1 && styles.iconOff]}>▼</Text>
              </Pressable>
              <Pressable
                style={styles.iconBtn}
                onPress={() => commit(removeTimelineRow(timeline, row))}
                accessibilityRole="button"
                accessibilityLabel="削除"
              >
                <Text style={styles.del}>✕</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {pick ? (
        <TilePickerSheet title="牌を選ぶ" onPick={onPick} onClose={() => setPick(null)} />
      ) : null}

      {/* 「鳴き」メニュー（この捨て牌を鳴いた人を選ぶ。web の手順タブと同一挙動）。 */}
      {callPick !== null &&
        (() => {
          const ev = timeline[callPick];
          if (ev?.kind !== "discard") return null;
          const choose = (s: Seat | null) => {
            commit(setTimelineCall(timeline, callPick, s));
            setCallPick(null);
          };
          return (
            <BottomSheet onClose={() => setCallPick(null)}>
              <Text style={styles.callTitle}>この捨て牌を鳴いた人</Text>
              <View style={styles.callSeats}>
                <Chip label="なし" on={ev.calledBy === null} onPress={() => choose(null)} />
                {otherSeats(ev.seat).map((s) => (
                  <Chip
                    key={s}
                    label={seatName(s)}
                    on={ev.calledBy === s}
                    onPress={() => choose(s)}
                  />
                ))}
              </View>
              <Text style={styles.callHint}>
                選ぶと手順に鳴きと「鳴いた人が切った牌」の行が入ります
              </Text>
            </BottomSheet>
          );
        })()}
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
  callTitle: { color: colors.white, fontSize: 15, fontWeight: "800", marginBottom: 12 },
  callSeats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  callHint: { color: colors.w45, fontSize: 10.5, marginTop: 12 },
  iconBtn: { width: 26, height: 30, alignItems: "center", justifyContent: "center" },
  icon: { color: colors.w70, fontSize: 12 },
  iconOff: { color: colors.line },
  del: { color: colors.vermilion, fontSize: 14, fontWeight: "800" },
});
