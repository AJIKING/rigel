import { AgariSchema, totalHan, type Agari, type Kifu, type Seat } from "@rigel/schema";
import {
  agariDeltas,
  inferOpen,
  payText,
  scoreAgari,
  selectYaku,
  windOf,
  yakuByGroup,
  yakuHan,
  SEAT_ORDER,
} from "@rigel/ui";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../../lib/theme";
import { Chip } from "../Chip";
import { MiniTile } from "../MiniTile";
import { Stepper } from "../Stepper";
import { SeatDeltas } from "./SeatDeltas";
import { TilePickerSheet } from "./TilePickerSheet";

const FU_OPTIONS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
const YAKU_GROUPS = yakuByGroup();

/**
 * 和了（アガリ）の入力フォーム（モバイル）。和了者・放銃者・リーチ・和了牌・符・
 * ドラ枚数・役を入力し、打点（点数は保存せず役/符から計算）をプレビューする。
 * ダブロン等の複数和了は kifu.rules に従って追加できる。web の AgariEditor と同等。
 */
export function AgariForm({
  kifu,
  dealer,
  onChange,
}: {
  kifu: Kifu;
  dealer: Seat;
  onChange: (agaris: Agari[]) => void;
}) {
  const agaris = kifu.agari;
  const deltas = agariDeltas(kifu);

  // 複数和了はロン（頭ハネ無効）のときのみ。ルール設定に依らず最大3人まで追加できる。
  const allRon = agaris.length > 0 && agaris.every((a) => a.from !== null);
  const canAdd = allRon && agaris.length < 3;

  function addAgari() {
    const used = new Set(agaris.map((a) => a.winner));
    const winner = SEAT_ORDER.find((seat) => !used.has(seat)) ?? "east";
    const from = agaris[0]?.from ?? SEAT_ORDER.find((seat) => seat !== winner)!;
    onChange([...agaris, AgariSchema.parse({ winner, from })]);
  }

  return (
    <View>
      {agaris.map((a, i) => (
        <AgariEntry
          key={i}
          kifu={kifu}
          dealer={dealer}
          agari={a}
          index={i}
          removable={agaris.length > 1}
          onChange={(na) => onChange(agaris.map((x, j) => (j === i ? na : x)))}
          onRemove={() => onChange(agaris.filter((_, j) => j !== i))}
        />
      ))}

      {canAdd ? (
        <Pressable style={styles.addBtn} onPress={addAgari} accessibilityRole="button">
          <Text style={styles.addBtnText}>＋ 和了者を追加</Text>
        </Pressable>
      ) : null}

      {agaris.length > 0 ? <SeatDeltas deltas={deltas} dealer={dealer} /> : null}
    </View>
  );
}

function AgariEntry({
  kifu,
  dealer,
  agari,
  index,
  removable,
  onChange,
  onRemove,
}: {
  kifu: Kifu;
  dealer: Seat;
  agari: Agari;
  index: number;
  removable: boolean;
  onChange: (a: Agari) => void;
  onRemove: () => void;
}) {
  // 門前/鳴きの既定は保存済みの役→盤面の副露の順に推定し（@rigel/ui の inferOpen。
  // 副露が melds として記録されていない牌譜でも保存済みの食い下がり飜を巻き戻さない）、
  // 手動トグルで上書きできる。上書きは和了者ごと（和了者を変えたら推定に戻る）。
  const [override, setOverride] = useState<{ winner: Seat; open: boolean } | null>(null);
  const winnerOpen =
    override?.winner === agari.winner
      ? override.open
      : inferOpen(agari.yaku, kifu.seats[agari.winner].melds.length > 0);
  const selectedYaku = new Set(agari.yaku.map((y) => y.name));
  const riichiSet = new Set(agari.riichi);
  const [pickWinTile, setPickWinTile] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    門前: true,
    鳴き可: true,
    役満: false,
  });

  const patch = (p: Partial<Agari>) => onChange(AgariSchema.parse({ ...agari, ...p }));
  const toggleYaku = (name: string) => {
    const names = selectedYaku.has(name)
      ? [...selectedYaku].filter((n) => n !== name)
      : [...selectedYaku, name];
    patch({ yaku: selectYaku(names, winnerOpen) });
  };
  const setOpen = (open: boolean) => {
    setOverride({ winner: agari.winner, open });
    patch({ yaku: selectYaku([...selectedYaku], open) });
  };

  const score = scoreAgari(agari, kifu.meta.dealer, kifu.rules);
  const han = totalHan(agari);

  return (
    <View style={styles.entry}>
      {removable ? (
        <View style={styles.entryHead}>
          <Text style={styles.entryTitle}>和了 {index + 1}</Text>
          <Pressable onPress={onRemove} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.remove}>削除</Text>
          </Pressable>
        </View>
      ) : null}

      <SeatRow
        label="和了者"
        seats={SEAT_ORDER}
        isOn={(seat) => agari.winner === seat}
        onPick={(seat) => patch({ winner: seat })}
        dealer={dealer}
      />
      {/* 和了種別（ツモ=放銃者なし / ロン=放銃者を選ぶ）。 */}
      <View style={styles.row}>
        <Text style={styles.label}>種別</Text>
        <View style={styles.seg}>
          {(
            [
              ["tsumo", "ツモ"],
              ["ron", "ロン"],
            ] as const
          ).map(([k, lbl]) => {
            const on = k === "tsumo" ? agari.from === null : agari.from !== null;
            return (
              <Pressable
                key={k}
                style={[styles.segBtn, on && styles.segOn]}
                onPress={() =>
                  patch({
                    from:
                      k === "tsumo"
                        ? null
                        : (agari.from ?? SEAT_ORDER.find((s) => s !== agari.winner)!),
                  })
                }
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{lbl}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {agari.from !== null ? (
        <SeatRow
          label="放銃者"
          seats={SEAT_ORDER.filter((seat) => seat !== agari.winner)}
          isOn={(seat) => agari.from === seat}
          onPick={(seat) => patch({ from: seat })}
          dealer={dealer}
        />
      ) : null}
      <SeatRow
        label="リーチ"
        seats={SEAT_ORDER}
        isOn={(seat) => riichiSet.has(seat)}
        onPick={(seat) =>
          patch({
            riichi: riichiSet.has(seat)
              ? [...riichiSet].filter((x) => x !== seat)
              : [...riichiSet, seat],
          })
        }
        dealer={dealer}
      />

      {/* 和了牌 */}
      <View style={styles.row}>
        <Text style={styles.label}>和了牌</Text>
        <Pressable
          onPress={() => setPickWinTile(true)}
          accessibilityRole="button"
          accessibilityLabel="和了牌を選ぶ"
        >
          <MiniTile code={agari.winTile} w={26} h={36} />
        </Pressable>
      </View>

      {/* 食い下がり飜の判定。副露を記録していない牌譜でも手動で切り替えられる。 */}
      <View style={styles.row}>
        <Text style={styles.label}>門前/鳴き</Text>
        <View style={styles.seg}>
          {(
            [
              [false, "門前"],
              [true, "鳴きあり"],
            ] as const
          ).map(([open, lbl]) => {
            const on = winnerOpen === open;
            return (
              <Pressable
                key={lbl}
                style={[styles.segBtn, on && styles.segOn]}
                onPress={() => setOpen(open)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.segText, on && styles.segTextOn]}>{lbl}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 符 */}
      <View style={styles.row}>
        <Text style={styles.label}>符</Text>
        <View style={styles.fuWrap}>
          {FU_OPTIONS.map((fu) => (
            <Chip key={fu} label={String(fu)} on={agari.fu === fu} onPress={() => patch({ fu })} />
          ))}
        </View>
      </View>

      {/* ドラ枚数 */}
      <Stepper
        label="表ドラ"
        unit="枚"
        value={agari.dora}
        max={20}
        onChange={(v) => patch({ dora: v })}
      />
      <Stepper
        label="赤ドラ"
        unit="枚"
        value={agari.aka}
        max={8}
        onChange={(v) => patch({ aka: v })}
      />
      <Stepper
        label="裏ドラ"
        unit="枚"
        value={agari.ura}
        max={20}
        onChange={(v) => riichiSet.has(agari.winner) && patch({ ura: v })}
      />

      {/* 役 */}
      {(["門前", "鳴き可", "役満"] as const).map((group) => {
        const picked = YAKU_GROUPS[group].filter((y) => selectedYaku.has(y.name)).length;
        const open = openGroups[group];
        return (
          <View key={group}>
            <Pressable
              style={styles.groupHead}
              onPress={() => setOpenGroups((o) => ({ ...o, [group]: !o[group] }))}
              accessibilityRole="button"
            >
              <Text style={styles.groupTitle}>
                {open ? "▾" : "▸"} {group}
                {picked > 0 ? `（${picked}）` : ""}
              </Text>
            </Pressable>
            {open ? (
              <View style={styles.yakuGrid}>
                {YAKU_GROUPS[group].map((y) => {
                  const h = yakuHan(y, winnerOpen);
                  const disabled = h === 0;
                  return (
                    <Chip
                      key={y.name}
                      label={`${y.name} ${disabled ? "—" : `${h}飜`}`}
                      on={selectedYaku.has(y.name)}
                      disabled={disabled}
                      onPress={() => toggleYaku(y.name)}
                    />
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      {/* 打点プレビュー（点数は保存しない＝役/符から計算） */}
      <View style={styles.score}>
        <Text style={styles.scoreMain}>
          {score.total.toLocaleString()}点{score.limit ? ` ${score.limit}` : ""}
        </Text>
        <Text style={styles.scoreSub}>
          {han}飜{agari.fu}符 ／ {payText(score)}
        </Text>
        {han === 0 ? (
          <Text style={styles.warn}>役がありません（ドラのみでは和了できません）。</Text>
        ) : null}
      </View>

      {pickWinTile ? (
        <TilePickerSheet
          title="和了牌を選ぶ"
          initialSuit={(agari.winTile?.[1] as "m" | "p" | "s" | "z") ?? "m"}
          onPick={(t) => {
            patch({ winTile: t });
            setPickWinTile(false);
          }}
          onClose={() => setPickWinTile(false)}
        />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

function SeatRow({
  label,
  seats,
  isOn,
  onPick,
  dealer,
}: {
  label: string;
  seats: Seat[];
  isOn: (seat: Seat) => boolean;
  onPick: (seat: Seat) => void;
  dealer: Seat;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.seg}>
        {seats.map((seat) => (
          <Pressable
            key={seat}
            style={[styles.segBtn, isOn(seat) && styles.segOn]}
            onPress={() => onPick(seat)}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn(seat) }}
          >
            <Text style={[styles.segText, isOn(seat) && styles.segTextOn]}>
              {windOf(seat, dealer)}家
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  entry: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    marginTop: 8,
    gap: 8,
  },
  entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entryTitle: { color: colors.white, fontWeight: "800", fontSize: 13 },
  remove: { color: colors.vermilion, fontWeight: "700", fontSize: 12.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 44 },
  seg: { flexDirection: "row", gap: 5, flex: 1 },
  segBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: radius.base,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.chrome2,
  },
  segOn: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  segText: { color: colors.w70, fontWeight: "800", fontSize: 12 },
  segTextOn: { color: colors.accent },
  fuWrap: { flexDirection: "row", flexWrap: "wrap", gap: 5, flex: 1 },
  groupHead: { paddingVertical: 6 },
  groupTitle: { color: colors.w45, fontWeight: "800", fontSize: 12 },
  yakuGrid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  score: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 10,
    gap: 2,
  },
  scoreMain: { color: colors.white, fontWeight: "800", fontSize: 18 },
  scoreSub: { color: colors.w70, fontSize: 12.5 },
  warn: { color: colors.vermilion, fontSize: 12 },
  addBtn: {
    marginTop: 8,
    paddingVertical: 11,
    alignItems: "center",
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13 },
});
