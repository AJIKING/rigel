import { SeatSchema, dealerForSeq, type Kifu, type Seat, type Tile } from "@rigel/schema";
import {
  addHandTile,
  addMeld,
  addRiverTile,
  applyResultMode,
  applyTileEdit,
  deriveWinResult,
  mutateKifu,
  removeDoraTile,
  removeHandTile,
  removeMeld,
  removeRiverTile,
  resultModeOf,
  setDoraTile,
  roundNameForSeq,
  seatLabel,
  calledByLabel,
  cycleCalledBy,
  setDiscardCalledBy,
  setDiscardFlags,
  sortKifuHands,
  windOf,
  MAX_SEQ,
  SEAT_ORDER,
  type MeldAddType,
  type PickerSuit,
  type ResultMode,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radius } from "../../lib/theme";
import { BoardTable } from "../BoardTable";
import { RoundPicker } from "../RoundPicker";
import { AgariForm } from "./AgariForm";
import { DrawForm } from "./DrawForm";
import { MiniTile } from "../MiniTile";
import { Segment } from "../Segment";
import { Stepper } from "../Stepper";
import { TilePickerSheet } from "./TilePickerSheet";
import { TimelineEditor } from "./TimelineEditor";

/** ピッカーが「今なにを編集しているか」。 */
type Picker =
  | { kind: "add-hand" }
  | { kind: "add-river" }
  | { kind: "add-meld"; meld: MeldAddType }
  | { kind: "edit-hand"; index: number; suit: PickerSuit }
  | { kind: "edit-river"; index: number; suit: PickerSuit }
  // ドラ/裏ドラは複数枚（カンで増える）。index あり=その1枚を変更/削除、無し=追加。
  | { kind: "dora"; index?: number }
  | { kind: "uradora"; index?: number }
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
  initialSeq,
  saving = false,
  onSave,
}: {
  initialKifu: Kifu;
  /** 局順（東一局=1〜北四局=16）。編集して onSave で返す。 */
  initialSeq: number;
  saving?: boolean;
  onSave: (kifu: Kifu, seq: number) => void;
}) {
  // 読み込んだ配牌は理牌して載せる（AIドラフト等の正規化。表示順＝データ順で index 編集を壊さない）。
  const [kifu, setKifu] = useState(() => sortKifuHands(initialKifu));
  // 旧自動採番の seq>16 は北四局へ丸める（API が seq>16 を拒否し保存不能になるため。web と同じ）。
  const [seq, setSeq] = useState(Math.min(Math.max(1, initialSeq), MAX_SEQ));
  const [seat, setSeat] = useState<Seat>(initialKifu.cameraBottomSeat ?? "east");
  const [picker, setPicker] = useState<Picker>(null);
  // 盤面（席ごと）/ 手順（タイムライン）の編集モード。web の 盤面/手順 タブと同等。
  const [mode, setMode] = useState<"board" | "timeline">("board");
  // 盤面プレビュー（編集を即時反映。席タップで編集対象を切替）。
  const [previewOpen, setPreviewOpen] = useState(true);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const dealer = kifu.meta.dealer ?? "east";
  const board = kifu.seats[seat];
  /** 編集中の席の呼称（東家など）。見出しと席セグメントで使う。 */
  const windName = (s: Seat) => `${windOf(s, dealer)}家`;
  const previewSize = Math.max(240, Math.min(width - 28, 340));
  const revealedAll = Object.fromEntries(
    SEAT_ORDER.map((s) => [s, kifu.seats[s].river.length]),
  ) as Record<Seat, number>;

  /** Kifu の不変更新（@rigel/ui の共有ヘルパ。web エディタと同じ流儀）。 */
  function mutate(fn: (draft: Kifu) => void) {
    setKifu(mutateKifu(kifu, fn));
  }

  /** 局順の変更。親は局順に連動して直す（導出は schema の dealerForSeq＝web と同一挙動）。
   *  親セグメントで後から手動上書きもできる。 */
  function changeSeq(n: number) {
    setSeq(n);
    mutate((d) => {
      d.meta.dealer = dealerForSeq(n);
    });
  }

  // 結果モード（なし/和了/流局）の導出・切替は @rigel/ui の共有ロジック（web と同一挙動）。
  const resultMode = resultModeOf(kifu);

  function setResult(r: ResultMode) {
    setKifu(applyResultMode(kifu, r, dealer));
  }

  function onPick(code: Tile) {
    if (!picker) return;
    // 手牌/河への追加はピッカーを閉じず連続入力できるようにする（13枚の手入力を素早く）。
    if (picker.kind === "add-hand") {
      setKifu(addHandTile(kifu, seat, code));
      return;
    }
    if (picker.kind === "add-river") {
      setKifu(addRiverTile(kifu, seat, code));
      return;
    }
    if (picker.kind === "add-meld") setKifu(addMeld(kifu, seat, picker.meld, code));
    else if (picker.kind === "edit-hand")
      setKifu(applyTileEdit(kifu, { seat, area: "hand", index: picker.index }, code));
    else if (picker.kind === "edit-river")
      setKifu(applyTileEdit(kifu, { seat, area: "river", index: picker.index }, code));
    else if (picker.kind === "dora" || picker.kind === "uradora") {
      const kind = picker.kind === "dora" ? "dora" : "uraDora";
      setKifu(setDoraTile(kifu, kind, code, picker.index));
    }
    setPicker(null);
  }

  function onDelete() {
    if (picker?.kind === "edit-hand") setKifu(removeHandTile(kifu, seat, picker.index));
    else if (picker?.kind === "edit-river") setKifu(removeRiverTile(kifu, seat, picker.index));
    else if (
      (picker?.kind === "dora" || picker?.kind === "uradora") &&
      picker.index !== undefined
    ) {
      const kind = picker.kind === "dora" ? "dora" : "uraDora";
      setKifu(removeDoraTile(kifu, kind, picker.index));
    }
    setPicker(null);
  }

  // リーチ/ツモ切りを編集する対象の河インデックス。
  // edit-river はその牌、add-river は直前に追加した末尾牌（追加しながら切り方を編集できる）。
  const discardIndex =
    picker?.kind === "edit-river"
      ? picker.index
      : picker?.kind === "add-river"
        ? board.river.length - 1
        : -1;
  const editingDiscard = discardIndex >= 0 ? (board.river[discardIndex] ?? null) : null;

  const pickerTitle = !picker
    ? ""
    : picker.kind === "add-hand"
      ? `配牌に追加（${board.hand.length}枚）`
      : picker.kind === "add-river"
        ? `河に追加（${board.river.length}枚）`
        : picker.kind === "add-meld"
          ? `${MELD_LABELS.find((m) => m.type === picker.meld)?.label}を追加`
          : picker.kind === "dora"
            ? picker.index === undefined
              ? "ドラを追加"
              : "ドラを変更"
            : picker.kind === "uradora"
              ? picker.index === undefined
                ? "裏ドラを追加"
                : "裏ドラを変更"
              : "牌を変更";

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        {/* 局メタ: 局名（編集可能。半荘内の好きな局として保存できる）。 */}
        <View style={styles.metaRow}>
          <Text style={styles.round}>{roundNameForSeq(seq)}</Text>
        </View>
        <RoundPicker value={seq} onChange={changeSeq} />
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

        {/* 局情報: 本場・供託 */}
        <View style={styles.metaBox}>
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
          {/* ドラ・裏ドラ（供託の下）。カンで増えるため複数枚（最大5）。牌タップで変更/削除、＋で追加。 */}
          <DoraEdit
            label="ドラ"
            tiles={kifu.meta.dora}
            onEdit={(index) => setPicker({ kind: "dora", index })}
            onAdd={() => setPicker({ kind: "dora" })}
          />
          <DoraEdit
            label="裏ドラ"
            tiles={kifu.meta.uraDora}
            onEdit={(index) => setPicker({ kind: "uradora", index })}
            onAdd={() => setPicker({ kind: "uradora" })}
          />
          {/* ルールは局ごとに持たず半荘単位。編集は半荘詳細画面（局一覧）で行う。 */}
        </View>

        {/* 盤面プレビュー（編集を即時反映。席タップで編集対象を切替） */}
        <Pressable
          style={styles.prevHead}
          onPress={() => setPreviewOpen((v) => !v)}
          accessibilityRole="button"
        >
          <Text style={styles.prevHeadText}>{previewOpen ? "▾" : "▸"} プレビュー</Text>
          {previewOpen ? <Text style={styles.prevHint}>席をタップで編集対象を切替</Text> : null}
        </Pressable>
        {previewOpen ? (
          <View style={styles.prevWrap}>
            <BoardTable
              kifu={kifu}
              bottomSeat={kifu.cameraBottomSeat ?? "east"}
              dealer={dealer}
              roundLabel={roundNameForSeq(seq)}
              revealed={revealedAll}
              showHands
              size={previewSize}
              selectedSeat={mode === "board" ? seat : undefined}
              onSeatPress={(s) => {
                setSeat(s);
                setMode("board");
              }}
            />
          </View>
        ) : null}

        {/* 盤面 / 手順 の編集モード切替 */}
        <View style={styles.tabRow}>
          <Segment
            options={
              [
                ["board", "盤面"],
                ["timeline", "手順"],
              ] as const
            }
            value={mode}
            onChange={setMode}
          />
        </View>

        {mode === "timeline" ? (
          <TimelineEditor kifu={kifu} dealer={dealer} onChange={setKifu} />
        ) : (
          <>
            {/* 編集する席（呼称はプレビューの表記と同じ「◯家」） */}
            <View style={styles.segRow}>
              <Text style={styles.metaLabel}>席</Text>
              <Segment
                options={SeatSchema.options.map((s) => [s, windName(s)] as const)}
                value={seat}
                onChange={setSeat}
              />
            </View>

            {/* 配牌（編集では「手牌」ではなく「配牌」の文言に統一）。 */}
            <SectionLabel>
              {windName(seat)}の配牌（{board.hand.length}枚）
            </SectionLabel>
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
              <AddButton label="配牌に追加" onPress={() => setPicker({ kind: "add-hand" })} />
            </View>

            {/* 河 */}
            <SectionLabel>
              {windName(seat)}の河（{board.river.length}枚）
            </SectionLabel>
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
            <SectionLabel>{windName(seat)}の鳴き</SectionLabel>
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
          </>
        )}

        {/* 結果（なし / 和了 / 流局）。点数は保存せず役・符・聴牌から計算＝プレビュー。 */}
        <SectionLabel>結果</SectionLabel>
        <Segment
          options={
            [
              ["none", "なし"],
              ["win", "和了"],
              ["draw", "流局"],
            ] as const
          }
          value={resultMode}
          onChange={setResult}
        />
        {resultMode === "win" ? (
          <AgariForm
            kifu={kifu}
            dealer={dealer}
            onChange={(agaris) =>
              mutate((d) => {
                d.agari = agaris;
                d.result = deriveWinResult(agaris);
              })
            }
          />
        ) : null}
        {resultMode === "draw" ? (
          <DrawForm
            tenpai={kifu.tenpai}
            dealer={dealer}
            onChange={(tenpai) =>
              mutate((d) => {
                d.tenpai = tenpai;
              })
            }
          />
        ) : null}
      </ScrollView>

      {/* 保存バー（ホームインジケータぶんの下余白を足す）。
          下書き/編集済は半荘単位のため、切替は半荘詳細（局一覧）で行う。 */}
      <View style={[styles.saveBar, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <Pressable
          style={[styles.saveBtn, styles.saveBtnWide, saving && styles.saveDisabled]}
          disabled={saving}
          onPress={() => onSave(kifu, seq)}
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
          canDelete={
            picker.kind === "edit-hand" ||
            picker.kind === "edit-river" ||
            ((picker.kind === "dora" || picker.kind === "uradora") && picker.index !== undefined)
          }
          discard={
            editingDiscard
              ? {
                  riichi: editingDiscard.riichi,
                  tsumogiri: editingDiscard.tsumogiri ?? false,
                  // 鳴かれた印は席名つきラベルで順送り（なし→下家→対面→上家）。
                  calledOn: editingDiscard.calledBy !== null,
                  calledLabel: calledByLabel(editingDiscard.calledBy),
                }
              : null
          }
          onPick={onPick}
          onDelete={onDelete}
          onToggleRiichi={() => {
            if (discardIndex < 0 || !editingDiscard) return;
            setKifu(setDiscardFlags(kifu, seat, discardIndex, { riichi: !editingDiscard.riichi }));
          }}
          onToggleTsumogiri={() => {
            if (discardIndex < 0 || !editingDiscard) return;
            setKifu(
              setDiscardFlags(kifu, seat, discardIndex, {
                tsumogiri: !editingDiscard.tsumogiri,
              }),
            );
          }}
          onToggleCalledBy={() => {
            if (discardIndex < 0 || !editingDiscard) return;
            setKifu(
              setDiscardCalledBy(
                kifu,
                seat,
                discardIndex,
                cycleCalledBy(editingDiscard.calledBy, seat),
              ),
            );
          }}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.section}>{children}</Text>;
}

/** ドラ/裏ドラの編集行（複数枚）。牌タップで変更/削除、＋で追加（最大5枚）。 */
function DoraEdit({
  label,
  tiles,
  onEdit,
  onAdd,
}: {
  label: string;
  tiles: Tile[];
  onEdit: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.doraRow}>
      <Text style={styles.doraRowLabel}>{label}</Text>
      <View style={styles.doraTiles}>
        {tiles.map((t, i) => (
          <Pressable
            key={`${t}-${i}`}
            onPress={() => onEdit(i)}
            accessibilityRole="button"
            accessibilityLabel={`${label}${i + 1}を変更`}
          >
            <MiniTile code={t} w={26} h={36} />
          </Pressable>
        ))}
        {tiles.length < 5 ? (
          <Pressable
            style={styles.doraAdd}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`${label}を追加`}
          >
            <Text style={styles.addText}>＋</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
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
  doraRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  doraRowLabel: { color: colors.w70, fontSize: 13, width: 52 },
  doraTiles: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5 },
  doraAdd: {
    width: 26,
    height: 36,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.w45,
    alignItems: "center",
    justifyContent: "center",
  },
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
  segRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  tabRow: { flexDirection: "row", marginTop: 4 },
  prevHead: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  prevHeadText: { color: colors.w70, fontSize: 12.5, fontWeight: "800" },
  prevHint: { color: colors.w45, fontSize: 10.5 },
  prevWrap: { alignItems: "center", marginTop: 6 },
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
  saveBtnWide: { flex: 1, alignItems: "center" },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
});
