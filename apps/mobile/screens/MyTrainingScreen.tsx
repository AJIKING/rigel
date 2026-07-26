import type { QuizKind } from "@rigel/schema";
import {
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_HISTORY_LIMIT,
  QUIZ_KIND_FILTERS,
  QUIZ_KIND_LABELS,
  QUIZ_STATS_PERIOD_LABELS,
  QUIZ_STATS_PERIODS,
  accuracyLabel,
  jstDateTime,
  quizDailyStats,
  quizStatsSummary,
  type QuizStatsPeriod,
} from "@rigel/ui";
import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { QuizLineChart } from "../components/QuizLineChart";
import { Segment } from "../components/Segment";
import { listQuizSessions, type QuizSessionDto } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

// 共有定義（@rigel/ui。web と同じ選択肢・並び）を Segment の [値, ラベル] 形式へ写す。
const PERIODS = QUIZ_STATS_PERIODS.map((p) => [p.key, p.label] as const);
const KINDS = QUIZ_KIND_FILTERS.map((k) => [k.key, k.label] as const);

/**
 * マイページ「特訓」セグメント（本人のみ）。サマリ・1分あたり正解数の推移（SVG 折れ線）・
 * 直近の履歴リスト。web の MyTrainingScreen と同一挙動。
 * now はテストの決定性のため注入可能（既定は現在時刻）。
 */
export function MyTrainingScreen({ now }: { now?: Date }) {
  const { token } = useAuth();
  const [nowValue] = useState(() => now ?? new Date());
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<QuizSessionDto[]>([]);
  const [period, setPeriod] = useState<QuizStatsPeriod>("7d");
  const [kind, setKind] = useState<"all" | QuizKind>("all");
  const kindFilter = kind === "all" ? undefined : kind;

  useEffect(() => {
    if (!token) return;
    let active = true;
    listQuizSessions(token)
      .catch(() => [] as QuizSessionDto[])
      .then((list) => {
        if (active) {
          setSessions(list);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const summary = useMemo(() => quizStatsSummary(sessions, kindFilter), [sessions, kindFilter]);
  const points = useMemo(
    () => quizDailyStats(sessions, period, nowValue, kindFilter),
    [sessions, period, nowValue, kindFilter],
  );
  const history = useMemo(
    () =>
      sessions
        .filter((x) => kindFilter === undefined || x.kind === kindFilter)
        .sort((a, b) => -a.createdAt.localeCompare(b.createdAt))
        .slice(0, QUIZ_HISTORY_LIMIT),
    [sessions, kindFilter],
  );

  if (!token) {
    return <CenterState message="ログインすると特訓の記録が見られます。" />;
  }
  if (loading) {
    return <CenterState loading />;
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={history}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.feed}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* サマリ3枠（特訓の結果画面と同じ stat カード風: 数値大きく・ラベル小さくグレー） */}
            <View style={styles.statsRow}>
              <View style={styles.statCard} testID="stat-sessions">
                <Text style={styles.statValue}>{summary.sessions}</Text>
                <Text style={styles.statLabel}>挑戦回数</Text>
              </View>
              <View style={styles.statCard} testID="stat-best">
                <Text style={styles.statValue}>{summary.bestCorrect}</Text>
                <Text style={styles.statLabel}>自己ベスト</Text>
              </View>
              <View style={styles.statCard} testID="stat-accuracy">
                <Text style={styles.statValue}>{accuracyLabel(summary.avgAccuracy)}</Text>
                <Text style={styles.statLabel}>平均正答率</Text>
              </View>
            </View>
            <View style={styles.segRow}>
              <Segment options={PERIODS} value={period} onChange={setPeriod} />
            </View>
            <View style={styles.segRow}>
              <Segment options={KINDS} value={kind} onChange={setKind} />
            </View>
            {/* カード（白地・タイトル）はグラフ側が持つ。期間内に記録が無ければ何も出ない。 */}
            <QuizLineChart
              points={points}
              title="1分あたり正解数"
              accessibilityLabel={`1分あたり正解数の推移（${QUIZ_STATS_PERIOD_LABELS[period]}）`}
            />
          </View>
        }
        ListEmptyComponent={<CenterState message={QUIZ_EMPTY_HISTORY_MESSAGE} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.rowDate}>{jstDateTime(item.createdAt)}</Text>
              <Text style={styles.rowKind}>{QUIZ_KIND_LABELS[item.kind]}</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowScore}>
                {item.correct} / {item.total}問
              </Text>
              <Text style={styles.rowAcc}>
                正答率 {accuracyLabel(item.total > 0 ? item.correct / item.total : null)}
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  feed: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 10, flexGrow: 1 },
  header: { gap: 10, marginBottom: 10 },
  // サマリの stat カード（特訓の結果画面と同じトーン）
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  statValue: {
    color: colors.white,
    fontSize: 20,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  statLabel: { color: colors.w45, fontSize: 10.5, fontWeight: "700" },
  segRow: { flexDirection: "row" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowLeft: { gap: 5, flexShrink: 1, alignItems: "flex-start" },
  rowRight: { alignItems: "flex-end", gap: 3 },
  rowDate: { color: colors.w45, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  // 種目はチップ（web の履歴行と同じピル形）
  rowKind: {
    color: colors.accent,
    fontSize: 10.5,
    fontWeight: "800",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,158,69,0.45)",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 2,
    overflow: "hidden",
  },
  rowScore: {
    color: colors.white,
    fontSize: 13.5,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  rowAcc: { color: colors.w70, fontSize: 11.5, fontVariant: ["tabular-nums"] },
});
