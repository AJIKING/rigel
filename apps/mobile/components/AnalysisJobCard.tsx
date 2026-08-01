// 解析ジョブの進行カード（牌譜一覧の先頭。docs/plans/async-analysis.md 8-2 案B）。
// processing: スピナー＋「閉じてもOK」の案内（待たなくていい、を UI で伝える）。
// failed / timeout: danger 枠＋理由＋✕（dismiss）。
// 意匠は隣に並ぶ KifuCard と揃える（chrome 面・radius.card・hairline 枠）。

import { analysisTimeoutMessage, roundNameForSeq } from "@rigel/ui";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import type { AnalysisCard } from "../lib/use-analysis-job";

export function AnalysisJobCard({
  card,
  onDismiss,
}: {
  card: AnalysisCard;
  onDismiss: () => void;
}) {
  if (card.kind === "processing") {
    return (
      // 撮影画面から戻った直後に非同期で現れるカードなので、スクリーンリーダーにも通知する。
      <View style={styles.card} accessibilityLiveRegion="polite">
        <ActivityIndicator color={colors.accent} />
        <View style={styles.body}>
          <Text style={styles.title}>AI解析中…</Text>
          <Text style={styles.sub}>
            {card.seq !== undefined ? `${roundNameForSeq(card.seq)}を作成しています。` : ""}
            アプリを閉じてもOK。完了すると自動で追加されます。
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, styles.cardError]} accessibilityRole="alert">
      <View style={styles.body}>
        <Text style={styles.titleError}>
          {card.kind === "failed" ? "解析に失敗しました" : "解析に時間がかかっています"}
        </Text>
        <Text style={card.kind === "failed" ? styles.subError : styles.sub}>
          {card.kind === "failed" ? card.message : analysisTimeoutMessage()}
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="解析の通知を閉じる"
        hitSlop={8}
      >
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 11,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  cardError: { borderWidth: 1, borderColor: colors.vermilion },
  body: { flex: 1, gap: 3 },
  title: { color: colors.white, fontSize: 14, fontWeight: "800" },
  titleError: { color: colors.danger, fontSize: 14, fontWeight: "800" },
  sub: { color: colors.w70, fontSize: 12, lineHeight: 18 },
  // 失敗理由は二次情報ではなく本文エラー（theme の規約: 本文エラーは danger）。
  subError: { color: colors.danger, fontSize: 12, lineHeight: 18 },
  close: { color: colors.w45, fontSize: 16, padding: 4 },
});
