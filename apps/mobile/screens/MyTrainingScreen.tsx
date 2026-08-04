import {
  QUIZ_EMPTY_HISTORY_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_STATS_PERIOD_LABELS,
  QUIZ_STATS_PERIODS,
  accuracyLabel,
  jstDateTime,
  quizBoardMeta,
  quizKindBoards,
  quizRecentHistory,
  type QuizStatsPeriod,
} from "@rigel/ui";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { QuizLineChart } from "../components/QuizLineChart";
import { RankingLink } from "../components/RankingLink";
import { Segment } from "../components/Segment";
import { listQuizSessions, type QuizSessionDto } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { colors, radius } from "../lib/theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// 共有定義（@rigel/ui。web と同じ選択肢・並び）を Segment の [値, ラベル] 形式へ写す。
const PERIODS = QUIZ_STATS_PERIODS.map((p) => [p.key, p.label] as const);

/**
 * マイページ「特訓」セグメント（本人のみ）。**種目ごとの折れ線グラフ**（1分あたり正解数）を
 * 縦に並べ、その下に全種目まとめた直近の履歴リストを出す。web の MyTrainingScreen と同一挙動。
 * now はテストの決定性のため注入可能（既定は現在時刻）。
 *
 * 種目をまたいだ合算（旧「全種目」）は置かない（[決定] 2026-07-27 オーナー）:
 * 1分あたり正解数は種目ごとに1問の重さが違い、混ぜた線は「上達」ではなく
 * 「その日どの種目をやったか」で動くため。集計は @rigel/ui の quizKindBoards に一元化。
 */
export function MyTrainingScreen({ now }: { now?: Date }) {
  const nav = useNavigation<Nav>();
  const { token } = useAuth();
  const [nowValue] = useState(() => now ?? new Date());
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<QuizSessionDto[]>([]);
  const [period, setPeriod] = useState<QuizStatsPeriod>("7d");

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

  const boards = useMemo(
    () => quizKindBoards(sessions, period, nowValue),
    [sessions, period, nowValue],
  );
  const history = useMemo(() => quizRecentHistory(sessions), [sessions]);

  if (!token) {
    return <CenterState message="サインインすると特訓の記録が見られます。" />;
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
            <View style={styles.segRow}>
              <Segment options={PERIODS} value={period} onChange={setPeriod} />
              {/* ランキング導線（web マイページ特訓タブと同配置=チップ列の右端）。 */}
              <RankingLink style={styles.rankingLink} />
            </View>
            {/* 指標名は並んだグラフの上に1度だけ（カードの見出しは種目名が担う）。
                期間内に記録のある種目が無ければ見出しごと出さない。 */}
            {boards.length > 0 ? (
              <Text style={styles.metricTitle}>1分あたり正解数の推移</Text>
            ) : null}
            {boards.map((b) => (
              <QuizLineChart
                key={b.kind}
                points={b.points}
                title={b.label}
                meta={quizBoardMeta(b)}
                accessibilityLabel={`${b.label}の1分あたり正解数の推移（${QUIZ_STATS_PERIOD_LABELS[period]}）`}
              />
            ))}
          </View>
        }
        ListEmptyComponent={<CenterState message={QUIZ_EMPTY_HISTORY_MESSAGE} />}
        renderItem={({ item }) => (
          // 行タップでセッション詳細へ（有料は保存された見直しレコードを確認できる）。
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => nav.navigate("TrainingSession", { id: item.id })}
            accessibilityRole="button"
          >
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
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  feed: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 20, gap: 10, flexGrow: 1 },
  header: { gap: 10, marginBottom: 10 },
  metricTitle: { color: colors.w45, fontSize: 11.5, fontWeight: "700", marginTop: 4 },
  segRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  // ランキング導線（見た目は共有 RankingLink。ここは配置だけ）。
  rankingLink: { marginLeft: "auto" },
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
  rowPressed: { transform: [{ scale: 0.98 }] },
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
