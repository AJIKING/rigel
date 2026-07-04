import {
  AgariSchema,
  KifuSchema,
  SeatSchema,
  type Agari,
  type Kifu,
  type Seat,
  type Tile,
} from "@rigel/schema";
import type { KifuStatus } from "@rigel/client";
import {
  addHandTile,
  addMeld,
  addRiverTile,
  applyTileEdit,
  removeHandTile,
  removeMeld,
  removeRiverTile,
  roundNameForSeq,
  seatLabel,
  setDiscardFlags,
  windOf,
  SEAT_ORDER,
  type MeldAddType,
  type PickerSuit,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { AgariForm } from "./AgariForm";
import { MiniTile } from "./MiniTile";
import { RulesSheet } from "./RulesSheet";
import { Segment } from "./Segment";
import { Stepper } from "./Stepper";
import { TilePickerSheet } from "./TilePickerSheet";

/** ピッカーが「今なにを編集しているか」。 */
type Picker =
  | { kind: "add-hand" }
  | { kind: "add-river" }
  | { kind: "add-meld"; meld: MeldAddType }
  | { kind: "edit-hand"; index: number; suit: PickerSuit }
  | { kind: "edit-river"; index: number; suit: PickerSuit }
  | { kind: "dora" }
  | { kind: "uradora" }
  | null;

// チー/ポンに加え、カンは種別（大明槓/暗槓/加槓）まで選べる（web の TilePickerPopup と同等）。
const MELD_LABELS: { type: MeldAddType; label: string }[] = [
  { type: "chi", label: "チー" },
  { type: "pon", label: "ポン" },
  { type: "kan_open", label: "大明槓" },
  { type: "kan_closed", label: "暗槓" },
  { type: "kan_added", label: "加槓" },
];

/**
 * 牌譜の編集画面本体（手入力）。席ごとの手牌・河・鳴きを編集し、保存で親へ返す。
 * 編集操作は @rigel/ui の純関数（Zod 再検証済み）だけを使う。
 */
export function KifuEditor({
  initialKifu,
  seq,
  initialStatus,
  saving = false,
  onSave,
}: {
  initialKifu: Kifu;
  /** 局順（1始まり）。局名表示に使う。 */
  seq: number;
  initialStatus: KifuStatus;
  saving?: boolean;
  onSave: (kifu: Kifu, status: KifuStatus) => void;
}) {
  const [kifu, setKifu] = useState(initialKifu);
  const [seat, setSeat] = useState<Seat>(initialKifu.cameraBottomSeat ?? "east");
  const [picker, setPicker] = useState<Picker>(null);
  const [status, setStatus] = useState<KifuStatus>(initialStatus);
  const [rulesOpen, setRulesOpen] = useState(false);

  const dealer = kifu.meta.dealer ?? "east";
  const board = kifu.seats[seat];

  /** Kifu の不変更新ヘルパ（複製 → 変更 → Zod 再検証。web エディタの mutate と同じ流儀）。 */
  function mutate(fn: (draft: Kifu) => void) {
    const draft = JSON.parse(JSON.stringify(kifu)) as Kifu;
    fn(draft);
    setKifu(KifuSchema.parse(draft));
  }

  /** 結果（なし/ロン/ツモ/流局）の切替。ロン/ツモは和了エントリを整え、それ以外は消す。 */
  function setResult(r: "none" | "ron" | "tsumo" | "draw") {
    mutate((draft) => {
      if (r === "none" || r === "draw") {
        draft.result = r === "none" ? null : "draw";
        draft.agari = [];
      } else if (r === "tsumo") {
        draft.result = "tsumo";
        const base: Agari = draft.agari[0] ?? AgariSchema.parse({ winner: dealer, from: null });
        draft.agari = [AgariSchema.parse({ ...base, from: null })]; // ツモは1件・放銃者なし
      } else {
        draft.result = "ron";
        const list: Agari[] = draft.agari.length
          ? draft.agari
          : [AgariSchema.parse({ winner: dealer, from: null })];
        draft.agari = list.map((a) =>
          AgariSchema.parse({ ...a, from: a.from ?? SEAT_ORDER.find((s) => s !== a.winner)! }),
        );
      }
    });
  }

  function onPick(code: Tile) {
    if (!picker) return;
    if (picker.kind === "add-hand") setKifu(addHandTile(kifu, seat, code));
    else if (picker.kind === "add-river") setKifu(addRiverTile(kifu, seat, code));
    else if (picker.kind === "add-meld") setKifu(addMeld(kifu, seat, picker.meld, code));
    else if (picker.kind === "edit-hand")
      setKifu(applyTileEdit(kifu, { seat, area: "hand", index: picker.index }, code));
    else if (picker.kind === "edit-river")
      setKifu(applyTileEdit(kifu, { seat, area: "river", index: picker.index }, code));
    else if (picker.kind === "dora")
      mutate((d) => {
        d.meta.dora = code;
      });
    else if (picker.kind === "uradora")
      mutate((d) => {
        d.meta.uraDora = code;
      });
    setPicker(null);
  }

  function onDelete() {
    if (picker?.kind === "edit-hand") setKifu(removeHandTile(kifu, seat, picker.index));
    else if (picker?.kind === "edit-river") setKifu(removeRiverTile(kifu, seat, picker.index));
    setPicker(null);
  }

  const editingDiscard = picker?.kind === "edit-river" ? (board.river[picker.index] ?? null) : null;

  const pickerTitle = !picker
    ? ""
    : picker.kind === "add-hand"
      ? "手牌に追加"
      : picker.kind === "add-river"
        ? "河に追加"
        : picker.kind === "add-meld"
          ? `${MELD_LABELS.find((m) => m.type === picker.meld)?.label}を追加`
          : picker.kind === "dora"
            ? "ドラを選ぶ"
            : picker.kind === "uradora"
              ? "裏ドラを選ぶ"
              : "牌を変更";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* 局メタ: 局名・ドラ・裏ドラ */}
        <View style={styles.metaRow}>
          <Text style={styles.round}>{roundNameForSeq(seq)}</Text>
          <View style={styles.doraWrap}>
            <View style={styles.doraCol}>
              <Text style={styles.doraLbl}>ドラ</Text>
              <Pressable
                onPress={() => setPicker({ kind: "dora" })}
                accessibilityRole="button"
                accessibilityLabel="ドラを選ぶ"
              >
                <MiniTile code={kifu.meta.dora} w={26} h={36} />
              </Pressable>
            </View>
            <View style={styles.doraCol}>
              <Text style={styles.doraLbl}>裏</Text>
              <Pressable
                onPress={() => setPicker({ kind: "uradora" })}
                accessibilityRole="button"
                accessibilityLabel="裏ドラを選ぶ"
              >
                <MiniTile code={kifu.meta.uraDora} w={26} h={36} />
              </Pressable>
            </View>
          </View>
        </View>
        <View style={styles.segRow}>
          <Text style={styles.metaLabel}>親</Text>
          <Segment
            options={SeatSchema.options.map((s) => [s, seatLabel(s)] as const)}
            value={dealer}
            onChange={(s) =>
              mutate((d) => {
                d.meta.dealer = s;
              })
            }
          />
        </View>

        {/* 局情報: 最終巡目・本場・供託 */}
        <View style={styles.metaBox}>
          <Stepper
            label="最終巡目"
            unit="巡"
            value={kifu.meta.junme}
            min={1}
            max={30}
            onChange={(v) =>
              mutate((d) => {
                d.meta.junme = v;
              })
            }
          />
          <Stepper
            label="本場"
            unit="本場"
            value={kifu.meta.honba}
            min={0}
            max={19}
            onChange={(v) =>
              mutate((d) => {
                d.meta.honba = v;
              })
            }
          />
          <Stepper
            label="供託"
            unit="本"
            value={kifu.meta.kyotaku}
            min={0}
            max={9}
            onChange={(v) =>
              mutate((d) => {
                d.meta.kyotaku = v;
              })
            }
          />
          <Pressable
            style={styles.rulesBtn}
            onPress={() => setRulesOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.rulesBtnText}>⚙ ルール設定</Text>
          </Pressable>
        </View>

        {/* 編集する席 */}
        <View style={styles.segRow}>
          <Text style={styles.metaLabel}>席</Text>
          <Segment
            options={SeatSchema.options.map(
              (s) => [s, `${seatLabel(s)}（${windOf(s, dealer)}家）`] as const,
            )}
            value={seat}
            onChange={setSeat}
            compact
          />
        </View>

        {/* 手牌 */}
        <SectionLabel>手牌（{board.hand.length}枚）</SectionLabel>
        <View style={styles.tiles}>
          {board.hand.map((t, i) => (
            <Pressable
              key={`h${i}`}
              onPress={() =>
                setPicker({
                  kind: "edit-hand",
                  index: i,
                  suit: (t.tile?.[1] as PickerSuit) ?? "m",
                })
              }
              accessibilityRole="button"
            >
              <MiniTile code={t.tile} w={30} h={42} />
            </Pressable>
          ))}
          <AddButton label="手牌に追加" onPress={() => setPicker({ kind: "add-hand" })} />
        </View>

        {/* 河 */}
        <SectionLabel>河（{board.river.length}枚）</SectionLabel>
        <View style={styles.tiles}>
          {board.river.map((d, i) => (
            <Pressable
              key={`r${i}`}
              onPress={() =>
                setPicker({
                  kind: "edit-river",
                  index: i,
                  suit: (d.tile?.[1] as PickerSuit) ?? "m",
                })
              }
              accessibilityRole="button"
            >
              <MiniTile code={d.tile} w={30} h={42} riichi={d.riichi} tsumogiri={d.tsumogiri} />
            </Pressable>
          ))}
          <AddButton label="河に追加" onPress={() => setPicker({ kind: "add-river" })} />
        </View>

        {/* 鳴き */}
        <SectionLabel>鳴き</SectionLabel>
        {board.melds.map((m, mi) => (
          <View key={`m${mi}`} style={styles.meldRow}>
            <View style={styles.meldTiles}>
              {m.tiles.map((t, ti) => (
                <MiniTile key={ti} code={t.tile} w={26} h={36} />
              ))}
            </View>
            <Pressable
              onPress={() => setKifu(removeMeld(kifu, seat, mi))}
              accessibilityRole="button"
              accessibilityLabel={`鳴き${mi + 1}を削除`}
              hitSlop={8}
            >
              <Text style={styles.meldDelete}>削除</Text>
            </Pressable>
          </View>
        ))}
        <View style={styles.meldAdd}>
          {MELD_LABELS.map(({ type, label }) => (
            <Pressable
              key={type}
              style={styles.meldBtn}
              onPress={() => setPicker({ kind: "add-meld", meld: type })}
              accessibilityRole="button"
            >
              <Text style={styles.meldBtnText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {/* 結果・和了（点数は保存せず役/符から計算＝打点プレビュー） */}
        <SectionLabel>結果</SectionLabel>
        <Segment
          options={
            [
              ["none", "なし"],
              ["ron", "ロン"],
              ["tsumo", "ツモ"],
              ["draw", "流局"],
            ] as const
          }
          value={kifu.result ?? "none"}
          onChange={setResult}
        />
        {kifu.result === "ron" || kifu.result === "tsumo" ? (
          <AgariForm
            kifu={kifu}
            dealer={dealer}
            onChange={(agaris) =>
              mutate((d) => {
                d.agari = agaris;
              })
            }
          />
        ) : null}
      </ScrollView>

      {/* 保存バー */}
      <View style={styles.saveBar}>
        <Segment
          options={
            [
              ["draft", "下書き"],
              ["complete", "編集済"],
            ] as const
          }
          value={status}
          onChange={setStatus}
        />
        <Pressable
          style={[styles.saveBtn, saving && styles.saveDisabled]}
          disabled={saving}
          onPress={() => onSave(kifu, status)}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{saving ? "保存中…" : "保存"}</Text>
        </Pressable>
      </View>

      {picker ? (
        <TilePickerSheet
          title={pickerTitle}
          initialSuit={
            picker.kind === "edit-hand" || picker.kind === "edit-river" ? picker.suit : "m"
          }
          canDelete={picker.kind === "edit-hand" || picker.kind === "edit-river"}
          discard={
            editingDiscard
              ? { riichi: editingDiscard.riichi, tsumogiri: editingDiscard.tsumogiri ?? false }
              : null
          }
          onPick={onPick}
          onDelete={onDelete}
          onToggleRiichi={() => {
            if (picker.kind !== "edit-river" || !editingDiscard) return;
            setKifu(setDiscardFlags(kifu, seat, picker.index, { riichi: !editingDiscard.riichi }));
          }}
          onToggleTsumogiri={() => {
            if (picker.kind !== "edit-river" || !editingDiscard) return;
            setKifu(
              setDiscardFlags(kifu, seat, picker.index, {
                tsumogiri: !editingDiscard.tsumogiri,
              }),
            );
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}

      {rulesOpen ? (
        <RulesSheet
          rules={kifu.rules}
          onSave={(r) => {
            mutate((d) => {
              d.rules = r;
            });
            setRulesOpen(false);
          }}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

function AddButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      style={styles.add}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.addText}>＋</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 14, paddingBottom: 24, gap: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  round: { color: colors.white, fontSize: 17, fontWeight: "800" },
  doraWrap: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  doraCol: { alignItems: "center", gap: 3 },
  doraLbl: { color: colors.w45, fontSize: 10, fontWeight: "700" },
  metaLabel: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 24 },
  metaBox: {
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    marginTop: 4,
  },
  rulesBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  rulesBtnText: { color: colors.w70, fontWeight: "700", fontSize: 12.5 },
  segRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  section: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  add: {
    width: 30,
    height: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.w45,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  meldRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  meldTiles: { flexDirection: "row", gap: 3 },
  meldDelete: { color: colors.vermilion, fontSize: 12.5, fontWeight: "700" },
  meldAdd: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  meldBtn: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  meldBtnText: { color: colors.w70, fontWeight: "800", fontSize: 13 },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: 26,
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
});
