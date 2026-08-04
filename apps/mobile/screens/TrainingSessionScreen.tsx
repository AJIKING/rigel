import { useRoute, type RouteProp } from "@react-navigation/native";
import type { QuizSessionDetailDto } from "@rigel/client";
import {
  accuracyLabel,
  jstDateTime,
  LIST_LOAD_ERROR_MESSAGE,
  QUIZ_KIND_LABELS,
  QUIZ_RECORDS_PAID_NOTE,
} from "@rigel/ui";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { QuizReviewList } from "../components/QuizReviewList";
import { getQuizSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";
import type { RootStackParamList } from "../lib/navigation";

/**
 * 特訓セッション詳細（本人のみ。web /mypage/training/[sessionId] 相当）。
 * 有料はサーバ保存の見直しレコード（結果画面と同じ QuizReviewList）を表示し、
 * 無料・ダウングレード後は records=null なので案内を出す（[決定] 2026-08-04 ⑤
 * ダウングレード時は全て閲覧不可。行は保持されるので再アップグレードで閲覧が復活する）。
 */
export function TrainingSessionScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "TrainingSession">>();
  const { token } = useAuth();
  const [state, setState] = useState<{
    loading: boolean;
    detail: QuizSessionDetailDto | null;
    error: boolean;
  }>({ loading: true, detail: null, error: false });

  useEffect(() => {
    if (!token) {
      setState({ loading: false, detail: null, error: false });
      return;
    }
    let active = true;
    // 認証復元中にマウント→あとから token が届いた場合に、前段の loading:false のまま
    // 「見つかりません」を一瞬見せない（再フェッチ開始で loading に戻す）。
    setState({ loading: true, detail: null, error: false });
    getQuizSession(token, route.params.id)
      .then((detail) => {
        if (active) setState({ loading: false, detail, error: false });
      })
      .catch(() => {
        if (active) setState({ loading: false, detail: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [token, route.params.id]);

  if (!token) return <CenterState message="サインインすると特訓の記録が見られます。" />;
  if (state.loading) return <CenterState loading />;
  // 取得失敗は「0件」と混同させない（LIST_LOAD_ERROR_MESSAGE の流儀）。
  if (state.error) return <CenterState message={LIST_LOAD_ERROR_MESSAGE} />;
  if (!state.detail) return <CenterState message="記録が見つかりませんでした。" />;

  const d = state.detail;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <View style={styles.card}>
        <Text style={styles.kind}>{QUIZ_KIND_LABELS[d.kind]}</Text>
        <Text style={styles.date}>{jstDateTime(d.createdAt)}</Text>
        {/* スコアは結果画面と同じ stat カード横並び。 */}
        <View style={styles.stats}>
          <Text style={styles.stat}>正解 {d.correct}問</Text>
          <Text style={styles.stat}>出題 {d.total}問</Text>
          {/* 正答率の表記はマイページ一覧と同じ accuracyLabel（0問は — 表示）。 */}
          <Text style={styles.stat}>
            正答率 {accuracyLabel(d.total > 0 ? d.correct / d.total : null)}
          </Text>
        </View>
        {d.records === null ? (
          // 設定（プラン変更）への導線は意図的に置かない: 設定はタブ内 state（HomeTabs）で
          // スタック画面から遷移できず、アプリ内の課金導線は IAP 経由に限る審査配慮もあるため
          // 文言のみに留める（web は /settings リンクつき。2026-08-04 UXレビューで確認済み）。
          <Text style={styles.paidNote}>{QUIZ_RECORDS_PAID_NOTE}</Text>
        ) : (
          <QuizReviewList records={d.records} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 24 },
  // 結果画面（resultBox）と同じカード面。
  card: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
  },
  kind: { color: colors.white, fontSize: 15, fontWeight: "800" },
  date: { color: colors.w45, fontSize: 11.5, fontVariant: ["tabular-nums"] },
  stats: { flexDirection: "row", gap: 8, marginTop: 2 },
  stat: {
    flex: 1,
    color: colors.white,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 7,
    paddingHorizontal: 4,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    overflow: "hidden",
  },
  paidNote: {
    color: colors.w45,
    fontSize: 12.5,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: 18,
  },
});
