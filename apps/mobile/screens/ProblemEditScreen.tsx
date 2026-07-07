import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  RulesSchema,
  type Meld,
  type Problem,
  type ProblemKind,
  type Seat,
  type Tile,
} from "@rigel/schema";
import {
  addDraftMeld,
  assembleProblem,
  compareTiles,
  draftToKifu,
  problemHandMax,
  problemOpponentHands,
  problemRiverTiles,
  problemRoundLabel,
  seatLabel,
  tileLabel,
  LIMIT_MESSAGES,
  SEAT_ORDER,
  type MeldPick,
} from "@rigel/ui";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BoardTable } from "../components/BoardTable";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { MiniTile } from "../components/MiniTile";
import { Segment } from "../components/Segment";
import { Stepper } from "../components/Stepper";
import { TilePickerSheet } from "../components/editor/TilePickerSheet";
import { createProblem, getProblem, updateProblem, type ProblemPost } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { KIND_LABELS } from "../lib/problems";
import { colors, radius } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProblemEdit">;

/** 牌ピッカーの入力先。null=閉じている。 */
type Target =
  "hand" | "drawn" | "dora" | `river:${Seat}` | `opphand:${Seat}` | `meld:${MeldPick}` | null;

/** 相手の手牌の上限（副露編集なし＝13枚固定。web と同一）。 */
const OPP_HAND_MAX = 13;

const MELD_PICKS: { type: MeldPick; label: string }[] = [
  { type: "pon", label: "副露:ポン" },
  { type: "chi", label: "副露:チー" },
  { type: "kan", label: "副露:カン" },
];

/**
 * 何切る問題の作成/編集画面（route params の problemId 有無で切替）。
 * 手牌・ツモ・ドラ・各席の河・副露を TilePickerSheet で入力し、出題者のコメントを付けて保存する。
 * 正解は設けない（多様な正解を前提に、回答の分布を見る）。
 * 保存前にクライアントでも ProblemSchema で検証し、エラーは日本語で表示する（web 版と同挙動）。
 */
export function ProblemEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ProblemEdit">>();
  const { token } = useAuth();
  const problemId = route.params?.problemId;
  const [loading, setLoading] = useState(problemId !== undefined);
  const [initial, setInitial] = useState<ProblemPost | null>(null);

  useEffect(() => {
    if (!problemId) return;
    let active = true;
    getProblem(problemId, token ?? undefined)
      .catch(() => null)
      .then((p) => {
        if (active) {
          setInitial(p);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [problemId, token]);

  if (loading) return <CenterState loading />;
  if (problemId && !initial) return <CenterState message="問題が見つかりません。" />;
  return <EditorBody initial={initial ?? undefined} token={token} />;
}

function EditorBody({ initial, token }: { initial?: ProblemPost; token: string | null }) {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const p0 = initial?.problem;

  const [kind, setKind] = useState<ProblemKind>(p0?.kind ?? "discard");
  const [pov, setPov] = useState<Seat>(p0?.pov ?? "east");
  const [hand, setHand] = useState<Tile[]>(
    p0 ? p0.seats[p0.pov].hand.flatMap((t) => (t.tile ? [t.tile] : [])) : [],
  );
  const [melds, setMelds] = useState<Meld[]>(p0 ? p0.seats[p0.pov].melds : []);
  const [drawn, setDrawn] = useState<Tile | null>(p0?.drawn ?? null);
  const [rivers, setRivers] = useState<Record<Seat, Tile[]>>(() => problemRiverTiles(p0));
  // 相手の手牌（出題オプション。配牌何切る等、相手の手が重要でない問題では OFF）。
  const [oppHands, setOppHands] = useState<Record<Seat, Tile[]>>(() => problemOpponentHands(p0));
  const [oppOn, setOppOn] = useState(() =>
    SEAT_ORDER.some((seat) => problemOpponentHands(p0)[seat].length > 0),
  );
  const [dora, setDora] = useState<Tile[]>(p0?.meta.dora ?? []);
  const [targetSeat, setTargetSeat] = useState<Seat>(p0?.targetSeat ?? "south");
  const [roundWind, setRoundWind] = useState<Seat>(p0?.meta.roundWind ?? "east");
  const [dealer, setDealer] = useState<Seat>(p0?.meta.dealer ?? "east");
  const [junme, setJunme] = useState(p0?.meta.junme ?? 6);
  const [honba, setHonba] = useState(p0?.meta.honba ?? 0);
  const [kyotaku, setKyotaku] = useState(p0?.meta.kyotaku ?? 0);
  const [scoresOn, setScoresOn] = useState(p0?.scores != null);
  const [scores, setScores] = useState<Record<Seat, string>>({
    east: String(p0?.scores?.east ?? 25000),
    south: String(p0?.scores?.south ?? 25000),
    west: String(p0?.scores?.west ?? 25000),
    north: String(p0?.scores?.north ?? 25000),
  });
  // ルールは編集UIを持たない（既存問題の設定は保持・新規は既定=Mリーグ相当）。
  const [rules] = useState(() => p0?.rules ?? RulesSchema.parse({}));

  const [title, setTitle] = useState(initial?.title ?? "");
  const [explanation, setExplanation] = useState(p0?.explanation ?? "");

  const [target, setTarget] = useState<Target>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 盤面プレビュー（牌譜と同じ回転卓に編集内容を即時反映。KifuEditor と同じ折りたたみ・既定 open）。
  const [previewOpen, setPreviewOpen] = useState(true);
  const { width } = useWindowDimensions();

  const handMax = problemHandMax(melds.length);
  const sortedHand = [...hand].sort(compareTiles);
  const oppSeats = SEAT_ORDER.filter((seat) => seat !== pov);

  // 編集途中でも検証なしで Kifu へ写して描く（枚数不足でもプレビューできる）。
  const previewKifu = useMemo(
    () =>
      draftToKifu({
        pov,
        hand,
        melds,
        opponentHands: oppOn ? oppHands : undefined,
        rivers,
        meta: { dealer, roundWind, honba, kyotaku, junme, dora },
        rules,
      }),
    [
      pov,
      hand,
      melds,
      oppOn,
      oppHands,
      rivers,
      dealer,
      roundWind,
      honba,
      kyotaku,
      junme,
      dora,
      rules,
    ],
  );
  // 鳴き判断は対象席の河の末尾＝対象牌を卓上で強調（回答画面と同じ見え方）。
  const previewHighlight =
    kind === "call" && rivers[targetSeat].length > 0
      ? { seat: targetSeat, index: rivers[targetSeat].length - 1 }
      : null;
  const previewRoundLabel = problemRoundLabel({ roundWind, junme });
  const previewSize = Math.max(240, Math.min(width - 28, 340));

  function onPick(code: Tile) {
    setErr(null);
    if (!target) return;
    // 手牌・河・ドラは連続入力（ピッカーを開いたまま）。ツモ・副露は1回で閉じる。
    if (target === "hand") {
      if (hand.length < handMax) setHand((cur) => [...cur, code]);
      return;
    }
    if (target === "drawn") {
      setDrawn(code);
      setTarget(null);
      return;
    }
    if (target === "dora") {
      if (dora.length < 5) setDora((cur) => [...cur, code]);
      return;
    }
    if (target.startsWith("river:")) {
      const seat = target.slice("river:".length) as Seat;
      setRivers((cur) => ({ ...cur, [seat]: [...cur[seat], code] }));
      return;
    }
    if (target.startsWith("opphand:")) {
      const seat = target.slice("opphand:".length) as Seat;
      // 相手は副露編集なし＝手牌13枚固定（連続入力。web と同一挙動）。
      setOppHands((cur) =>
        cur[seat].length < OPP_HAND_MAX ? { ...cur, [seat]: [...cur[seat], code] } : cur,
      );
      return;
    }
    const type = target.slice("meld:".length) as MeldPick;
    // 副露の生成と手牌の3枚換算圧迫は共有純関数（web と同一挙動）。
    const next = addDraftMeld(hand, melds, type, code);
    setHand(next.hand);
    setMelds(next.melds);
    setTarget(null);
  }

  function removeHandAt(i: number) {
    const tile = sortedHand[i];
    if (!tile) return;
    setHand((cur) => {
      const j = cur.indexOf(tile);
      return j < 0 ? cur : [...cur.slice(0, j), ...cur.slice(j + 1)];
    });
  }

  /** 相手の手牌設定の ON/OFF。OFF に戻したら入力済みの他家手牌は破棄する（web と同一挙動）。 */
  function toggleOpp() {
    setOppOn((cur) => {
      if (cur) {
        setOppHands({ east: [], south: [], west: [], north: [] });
        // 他家手牌のピッカーを開いたままなら閉じる（入力先が消えるため）。
        setTarget((t) => (t?.startsWith("opphand:") ? null : t));
      }
      return !cur;
    });
  }

  /** 他家の手牌から指定の牌を1枚外す（チップは理牌表示なので牌で探す）。 */
  function removeOppTile(seat: Seat, tile: Tile) {
    setOppHands((cur) => {
      const j = cur[seat].indexOf(tile);
      return j < 0
        ? cur
        : { ...cur, [seat]: [...cur[seat].slice(0, j), ...cur[seat].slice(j + 1)] };
    });
  }

  /** 編集状態→Problem の組み立て・検証は共有純関数（web と同一挙動）。 */
  function build(): { problem?: Problem; error?: string } {
    return assembleProblem({
      kind,
      pov,
      hand,
      melds,
      drawn,
      opponentHands: oppOn ? oppHands : undefined,
      targetSeat,
      rivers,
      meta: { dealer, roundWind, honba, kyotaku, junme, dora },
      scores: scoresOn ? scores : null,
      rules,
      explanation,
    });
  }

  async function save(status: "draft" | "published") {
    if (!token) {
      setErr("ログインが必要です。");
      return;
    }
    const { problem, error } = build();
    if (!problem) {
      setErr(error ?? null);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = initial
      ? await updateProblem(token, initial.id, { title, problem, status }).catch(() => ({
          ok: false,
          status: 0,
        }))
      : await createProblem(token, { title, problem, status }).catch(() => ({
          ok: false,
          status: 0,
        }));
    setBusy(false);
    if (res.ok) {
      nav.goBack();
      return;
    }
    setErr(res.status === 403 ? LIMIT_MESSAGES.problems : "保存に失敗しました。");
  }

  /** 牌ピッカーの見出し（入力先ごとに文言と残枚数を出し分ける）。 */
  function pickerTitleOf(t: Target): string {
    if (!t) return "";
    if (t === "hand") return `手牌に追加（${hand.length}/${handMax}枚）`;
    if (t === "drawn") return "ツモ牌を選ぶ";
    if (t === "dora") return `ドラを追加（${dora.length}/5枚）`;
    if (t.startsWith("river:")) return `${seatLabel(t.slice("river:".length) as Seat)}家の河に追加`;
    if (t.startsWith("opphand:")) {
      const seat = t.slice("opphand:".length) as Seat;
      return `${seatLabel(seat)}家の手牌に追加（${oppHands[seat].length}/${OPP_HAND_MAX}枚）`;
    }
    return `${MELD_PICKS.find((m) => `meld:${m.type}` === t)?.label}を追加`;
  }
  const pickerTitle = pickerTitleOf(target);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <TextInput
          style={styles.input}
          value={title}
          maxLength={80}
          placeholder="タイトル"
          placeholderTextColor={colors.w45}
          accessibilityLabel="タイトル"
          onChangeText={setTitle}
        />

        {/* 出題形式 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>出題形式</Text>
          <Segment
            options={(["discard", "call"] as const).map((k) => [k, KIND_LABELS[k]] as const)}
            value={kind}
            onChange={setKind}
          />
        </View>

        {/* 視点・鳴き判断の対象席 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>自分の席</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, seatLabel(s)] as const)}
            value={pov}
            onChange={(s) => {
              setPov(s);
              // 対象席は自分以外（重なったら次の席へずらす）。
              if (targetSeat === s) {
                setTargetSeat(SEAT_ORDER.find((x) => x !== s) ?? "south");
              }
            }}
          />
        </View>
        {kind === "call" ? (
          <>
            <View style={styles.segRow}>
              <Text style={styles.rowLabel}>誰の捨て牌</Text>
              <Segment
                options={SEAT_ORDER.filter((s) => s !== pov).map(
                  (s) => [s, `${seatLabel(s)}家`] as const,
                )}
                value={targetSeat}
                onChange={setTargetSeat}
              />
            </View>
            <Text style={styles.hint}>
              対象席の河の最後の1枚が「鳴くかどうか」の対象牌になります。河に対象牌まで並べてください。
            </Text>
          </>
        ) : null}

        {/* 相手の手牌（出題オプション）。配牌何切る等、相手の手が重要でない問題では OFF。 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>相手の手牌</Text>
          <Chip label="相手の手牌も設定する" on={oppOn} onPress={toggleOpp} />
        </View>
        {oppOn ? <Text style={styles.hint}>設定した席の手牌は回答者に見えます。</Text> : null}

        {/* 局情報 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>場風</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, `${seatLabel(s)}場`] as const)}
            value={roundWind}
            onChange={setRoundWind}
          />
        </View>
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>親</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, seatLabel(s)] as const)}
            value={dealer}
            onChange={setDealer}
          />
        </View>
        <View style={styles.metaBox}>
          <Stepper label="巡目" unit="巡目" value={junme} min={1} max={30} onChange={setJunme} />
          <Stepper label="本場" unit="本場" value={honba} min={0} max={19} onChange={setHonba} />
          <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} onChange={setKyotaku} />
        </View>

        {/* 点数状況 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>点数状況</Text>
          <Chip
            label={scoresOn ? "入力する（表示中）" : "入力しない"}
            on={scoresOn}
            onPress={() => setScoresOn((v) => !v)}
          />
        </View>
        {scoresOn ? (
          <View style={styles.scoreRow}>
            {SEAT_ORDER.map((seat) => (
              <View key={seat} style={styles.scoreCell}>
                <Text style={styles.scoreLabel}>{seatLabel(seat)}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={scores[seat]}
                  keyboardType="number-pad"
                  accessibilityLabel={`${seatLabel(seat)}家の持ち点`}
                  onChangeText={(v) => setScores((cur) => ({ ...cur, [seat]: v }))}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* 盤面プレビュー（牌譜と同じ回転卓。編集内容を即時反映） */}
        <Pressable
          style={styles.prevHead}
          onPress={() => setPreviewOpen((v) => !v)}
          accessibilityRole="button"
        >
          <Text style={styles.prevHeadText}>{previewOpen ? "▾" : "▸"} プレビュー</Text>
        </Pressable>
        {previewOpen ? (
          <View style={styles.prevWrap}>
            {/* 出題者のプレビューは相手の手牌（設定時のみ）も表向きで確認できるようにする。 */}
            <BoardTable
              kifu={previewKifu}
              bottomSeat={pov}
              dealer={dealer}
              roundLabel={previewRoundLabel}
              showHands
              size={previewSize}
              highlightRiver={previewHighlight}
            />
          </View>
        ) : null}

        {/* ドラ */}
        <TileRow
          label="ドラ"
          tiles={dora}
          removeLabel={(t, i) => `ドラ${i + 1}（${tileLabel(t)}）を外す`}
          onRemove={(i) => setDora((cur) => cur.filter((_, j) => j !== i))}
          addLabel="ドラを追加"
          onAdd={dora.length < 5 ? () => setTarget("dora") : undefined}
        />

        {/* 手牌（理牌表示・タップで削除） */}
        <Text style={styles.section}>
          手牌（{hand.length}/{handMax}枚）
        </Text>
        <View style={styles.tiles}>
          {sortedHand.map((t, i) => (
            <Pressable
              key={`${t}-${i}`}
              onPress={() => removeHandAt(i)}
              accessibilityRole="button"
              accessibilityLabel={`${tileLabel(t)} を外す`}
            >
              <MiniTile code={t} w={30} h={42} />
            </Pressable>
          ))}
          {hand.length < handMax ? (
            <AddButton label="手牌に追加" onPress={() => setTarget("hand")} />
          ) : null}
        </View>

        {/* ツモ牌（何切るのみ） */}
        {kind === "discard" ? (
          <View style={styles.segRow}>
            <Text style={styles.rowLabel}>ツモ牌</Text>
            {drawn ? (
              <Pressable
                onPress={() => setDrawn(null)}
                accessibilityRole="button"
                accessibilityLabel={`ツモ牌 ${tileLabel(drawn)} を外す`}
              >
                <MiniTile code={drawn} w={30} h={42} />
              </Pressable>
            ) : (
              <AddButton label="ツモ牌を選ぶ" onPress={() => setTarget("drawn")} />
            )}
          </View>
        ) : null}

        {/* 副露 */}
        {melds.length > 0 ? (
          <View style={styles.tiles}>
            {melds.map((m, mi) => (
              <Pressable
                key={mi}
                style={styles.meldChip}
                onPress={() => setMelds((cur) => cur.filter((_, i) => i !== mi))}
                accessibilityRole="button"
                accessibilityLabel={`副露${mi + 1}を外す`}
              >
                {m.tiles.map((t, ti) => (
                  <MiniTile key={ti} code={t.tile} w={24} h={34} />
                ))}
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.meldAdd}>
          {MELD_PICKS.map(({ type, label }) => (
            <Chip
              key={type}
              label={label}
              a11ySelected={false}
              onPress={() => setTarget(`meld:${type}`)}
            />
          ))}
        </View>

        {/* 各席の河 */}
        {SEAT_ORDER.map((seat) => (
          <TileRow
            key={seat}
            label={`${seatLabel(seat)}家の河`}
            tiles={rivers[seat]}
            removeLabel={(t, i) => `${seatLabel(seat)}家の河${i + 1}（${tileLabel(t)}）を外す`}
            onRemove={(i) =>
              setRivers((cur) => ({ ...cur, [seat]: cur[seat].filter((_, j) => j !== i) }))
            }
            addLabel={`${seatLabel(seat)}家の河に追加`}
            onAdd={() => setTarget(`river:${seat}`)}
          />
        ))}

        {/* 相手の手牌（ON のとき pov 以外の3席。チップは理牌表示・タップで1枚外す） */}
        {oppOn
          ? oppSeats.map((seat) => {
              const sorted = [...oppHands[seat]].sort(compareTiles);
              return (
                <TileRow
                  key={`opp-${seat}`}
                  label={`${seatLabel(seat)}家の手牌`}
                  tiles={sorted}
                  removeLabel={(t) => `${seatLabel(seat)}家の手牌の ${tileLabel(t)} を外す`}
                  onRemove={(i) => {
                    const tile = sorted[i];
                    if (tile) removeOppTile(seat, tile);
                  }}
                  addLabel={`${seatLabel(seat)}家の手牌に追加`}
                  onAdd={
                    oppHands[seat].length < OPP_HAND_MAX
                      ? () => setTarget(`opphand:${seat}`)
                      : undefined
                  }
                />
              );
            })
          : null}

        {/* 正解は設けない（多様な正解を前提に、回答の分布を見る）。コメントだけ書ける。 */}
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={explanation}
          multiline
          placeholder="出題者のコメント（任意。回答後に表示されます）"
          placeholderTextColor={colors.w45}
          accessibilityLabel="出題者のコメント（任意。回答後に表示されます）"
          onChangeText={setExplanation}
        />

        {err ? <Text style={styles.err}>{err}</Text> : null}
      </ScrollView>

      {/* 保存バー */}
      <View style={[styles.saveBar, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <Pressable
          style={[styles.saveGhost, busy && styles.saveOff]}
          disabled={busy}
          onPress={() => void save("draft")}
          accessibilityRole="button"
        >
          <Text style={styles.saveGhostText}>下書き保存</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, busy && styles.saveOff]}
          disabled={busy}
          onPress={() => void save("published")}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{busy ? "保存中…" : "公開して保存"}</Text>
        </Pressable>
      </View>

      {target ? (
        <TilePickerSheet title={pickerTitle} onPick={onPick} onClose={() => setTarget(null)} />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

/** ラベル + 牌列（タップで削除）+ 追加ボタンの行（ドラ・河で共用）。 */
function TileRow({
  label,
  tiles,
  removeLabel,
  onRemove,
  addLabel,
  onAdd,
}: {
  label: string;
  tiles: Tile[];
  removeLabel: (tile: Tile, index: number) => string;
  onRemove: (index: number) => void;
  addLabel: string;
  onAdd?: () => void;
}) {
  return (
    <View style={styles.segRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.tilesInRow}>
        {tiles.map((t, i) => (
          <Pressable
            key={`${t}-${i}`}
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={removeLabel(t, i)}
          >
            <MiniTile code={t} w={26} h={36} />
          </Pressable>
        ))}
        {onAdd ? <AddButton label={addLabel} onPress={onAdd} small /> : null}
      </View>
    </View>
  );
}

function AddButton({
  label,
  onPress,
  small = false,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      style={[styles.add, small && styles.addSmall]}
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
  body: { padding: 14, paddingBottom: 24, gap: 10 },
  input: {
    color: colors.white,
    fontSize: 14,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  inputMulti: { minHeight: 84, textAlignVertical: "top" },
  segRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 64 },
  hint: { color: colors.w45, fontSize: 11.5, lineHeight: 17 },
  metaBox: {
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
  },
  scoreRow: { flexDirection: "row", gap: 8 },
  scoreCell: { flex: 1, gap: 3 },
  scoreLabel: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  scoreInput: {
    color: colors.white,
    fontSize: 13,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  section: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
  prevHead: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  prevHeadText: { color: colors.w70, fontSize: 12.5, fontWeight: "800" },
  prevWrap: { alignItems: "center", marginTop: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  tilesInRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  meldChip: {
    flexDirection: "row",
    gap: 2,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    backgroundColor: colors.chrome2,
  },
  meldAdd: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
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
  addSmall: { width: 26, height: 36 },
  addText: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  err: { color: colors.vermilion, fontSize: 12.5 },
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
  saveGhost: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
  },
  saveGhostText: { color: colors.w70, fontWeight: "800", fontSize: 14 },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
  },
  saveOff: { opacity: 0.5 },
  saveText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
});
