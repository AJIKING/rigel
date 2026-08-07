import type { QuizKind } from "@rigel/schema";
import {
  accuracyLabel,
  quizRankingName,
  quizScoreLabel,
  LIST_LOAD_ERROR_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_KINDS,
  QUIZ_RANKING_BOARD_LABEL,
  QUIZ_RANKING_EMPTY_MESSAGE,
  QUIZ_RANKING_PERIODS,
} from "@rigel/ui";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { Segment } from "../components/Segment";
import { getQuizRanking, type QuizRankingDto, type QuizRankingPeriodDto } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

// 共有定義（@rigel/ui。web /ranking と同じ選択肢・並び）を Segment の [値, ラベル] 形式へ写す。
const KINDS = QUIZ_KINDS.map((k) => [k, QUIZ_KIND_LABELS[k]] as const);
const PERIODS = QUIZ_RANKING_PERIODS.map((p) => [p.key, p.label] as const);

/**
 * 特訓ランキング（匿名可。web /ranking と同一挙動。[決定] 2026-08-04 強制表示）。
 * 種目×期間（週間/月間/全期間）で単一の「スコア」ボードを出す
 * （スコア = 正解数 × 正答率。[決定] 2026-08-07 2ボードから統合）。
 * 載るのは verified セッションの集計値と常時公開のプロフィール情報のみ。
 * サインイン時は自分の順位（圏外含む）を上に出す。
 */
export function RankingScreen() {
  const { token, loading: authLoading } = useAuth();
  const [kind, setKind] = useState<QuizKind>(QUIZ_KINDS[0]!);
  const [period, setPeriod] = useState<QuizRankingPeriodDto>("weekly");
  const [data, setData] = useState<QuizRankingDto | null>(null);
  /** 取得中（切替時は前の表示を保ったまま薄くする。web /ranking と同じ方式）。 */
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // 認証復元中は待つ（token 無しで1回・復元後にもう1回のコールドスタート二重 fetch を防ぐ）。
    if (authLoading) return;
    let active = true;
    setPending(true);
    setError(false);
    getQuizRanking(kind, period, token ?? undefined)
      .then((d) => {
        if (active) {
          setData(d);
          setPending(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setPending(false);
        }
      });
    return () => {
      active = false;
    };
  }, [kind, period, token, authLoading]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <View style={styles.segRow}>
        <Segment options={KINDS} value={kind} onChange={setKind} />
      </View>
      <View style={styles.segRow}>
        <Segment options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      {error ? (
        <CenterState message={LIST_LOAD_ERROR_MESSAGE} />
      ) : data === null ? (
        <CenterState loading />
      ) : (
        // 切替の取得中は前の表示を保ったまま薄くする（全面スピナーでスクロール位置を失わない）。
        <View style={[styles.boards, pending && styles.busy]} testID="ranking-boards">
          {/* 自分の順位（サインインかつ期間内に verified 記録があるときのみ）。 */}
          {data.me ? (
            <View style={styles.meRow}>
              <Text style={styles.meText}>
                あなた: <Text style={styles.meRank}>{data.me.rank}位</Text>（
                {QUIZ_RANKING_BOARD_LABEL} {quizScoreLabel(data.me.score)}）・{data.me.correct}問・
                {accuracyLabel(data.me.accuracy)}
              </Text>
            </View>
          ) : null}
          <View style={styles.board} testID="board-score">
            <Text style={styles.boardTitle}>{QUIZ_RANKING_BOARD_LABEL}</Text>
            {data.entries.length === 0 ? (
              <Text style={styles.empty}>{QUIZ_RANKING_EMPTY_MESSAGE}</Text>
            ) : (
              data.entries.map((e) => {
                const name = quizRankingName(e);
                return (
                  // 行を1つの読み上げ単位にする（順位だけが文脈なく読まれるのを防ぐ。
                  // web の ol/li 構造に相当）。明示ラベルを付けると子 Text は読まれないため、
                  // 内訳（○問・正答率）もラベルに含める（web の li 読み上げと意味を揃える）。
                  <View
                    key={`${e.rank}-${e.handle}`}
                    style={styles.row}
                    accessible
                    accessibilityLabel={
                      `${e.rank}位 ${name} ${QUIZ_RANKING_BOARD_LABEL} ${quizScoreLabel(e.score)}` +
                      ` ${e.correct}問 正答率 ${accuracyLabel(e.accuracy)}`
                    }
                  >
                    <Text style={[styles.rank, e.rank <= 3 && styles.rankTop]}>{e.rank}</Text>
                    {/* 表示は常時公開のプロフィール情報のみ（displayName || handle）。 */}
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    {/* 内訳（正解数・正答率）を添えてスコアの根拠を見えるようにする。 */}
                    <Text style={styles.sub}>
                      {e.correct}問・{accuracyLabel(e.accuracy)}
                    </Text>
                    <Text style={styles.value}>{quizScoreLabel(e.score)}</Text>
                  </View>
                );
              })
            )}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 24, gap: 10 },
  segRow: { flexDirection: "row" },
  // ボード列（body と同じ縦間隔。切替中の薄表示のためのラッパ）。
  boards: { gap: 10 },
  // 切替の取得中（前の表示を保ったまま薄くする）。
  busy: { opacity: 0.5 },
  meRow: {
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line2,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  meText: { color: colors.white, fontSize: 12.5, fontVariant: ["tabular-nums"] },
  meRank: { fontWeight: "800" },
  board: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  boardTitle: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 8,
  },
  rank: {
    width: 30,
    textAlign: "right",
    color: colors.w45,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  rankTop: { color: colors.accent },
  name: { flex: 1, color: colors.white, fontSize: 12.5 },
  /* スコアの内訳（正解数・正答率）。スコア本体より控えめに。 */
  sub: { color: colors.w45, fontSize: 10.5, fontVariant: ["tabular-nums"] },
  /* スコア本体（順位の物差し）。内訳より主に見えるよう太字にする（web と同じ強弱）。 */
  value: { color: colors.white, fontSize: 12.5, fontWeight: "700", fontVariant: ["tabular-nums"] },
  empty: { color: colors.w45, fontSize: 12.5, textAlign: "center", paddingVertical: 18 },
});
