import type { QuizKind } from "@rigel/schema";
import {
  QUIZ_KIND_LABELS,
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

const PERIODS = [
  ["7d", "7日"],
  ["30d", "30日"],
  ["all", "全期間"],
] as const;
const PERIOD_LABELS: Record<QuizStatsPeriod, string> = {
  "7d": "7日",
  "30d": "30日",
  all: "全期間",
};

const KINDS = [
  ["all", "全部"],
  ["chinitsu", "清一色"],
  ["efficiency", "牌効率"],
] as const;

/** 履歴リストの表示上限（直近）。web と同じ。 */
const HISTORY_LIMIT = 20;

/** ISO日時 → JST の 'YYYY/MM/DD HH:MM'（履歴行の日時。集計と同じ UTC+9 固定）。 */
function jstDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}`;
}

/** 正答率 0-1 → '70%'（null は '—' = 出題0問を0%と区別）。 */
function accuracyLabel(accuracy: number | null): string {
  return accuracy === null ? "—" : `${Math.round(accuracy * 100)}%`;
}

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
        .slice(0, HISTORY_LIMIT),
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
            <View style={styles.statsRow}>
              <Text style={styles.stat}>回数 {summary.sessions}</Text>
              <Text style={styles.stat}>ベストスコア {summary.bestCorrect}</Text>
              <Text style={styles.stat}>平均正答率 {accuracyLabel(summary.avgAccuracy)}</Text>
            </View>
            <View style={styles.segRow}>
              <Segment options={PERIODS} value={period} onChange={setPeriod} />
            </View>
            <View style={styles.segRow}>
              <Segment options={KINDS} value={kind} onChange={setKind} />
            </View>
            {points.length > 0 ? (
              <QuizLineChart
                points={points}
                accessibilityLabel={`1分あたり正解数の推移（${PERIOD_LABELS[period]}）`}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={<CenterState message="まだ記録がありません" />}
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
  feed: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 8, flexGrow: 1 },
  header: { gap: 10, marginBottom: 10 },
  statsRow: { flexDirection: "row", gap: 14, flexWrap: "wrap" },
  stat: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
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
  rowLeft: { gap: 3, flexShrink: 1 },
  rowRight: { alignItems: "flex-end", gap: 3 },
  rowDate: { color: colors.w45, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  rowKind: { color: colors.accent, fontSize: 11.5, fontWeight: "700" },
  rowScore: { color: colors.white, fontSize: 13.5, fontWeight: "800" },
  rowAcc: { color: colors.w70, fontSize: 11.5 },
});
