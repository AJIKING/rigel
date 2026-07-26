import { StyleSheet, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { Segment } from "../components/Segment";
import { colors } from "../lib/theme";
import { MyFavoritesScreen } from "./MyFavoritesScreen";
import { MyListScreen } from "./MyListScreen";
import { MyProblemsScreen } from "./MyProblemsScreen";
import { MyTrainingScreen } from "./MyTrainingScreen";

/** マイページの表示対象（牌譜=自分の半荘 / 何切る=自分の問題 /
 *  お気に入り=牌譜と何切るをまたいだ自分の★ / 特訓=クイズ履歴）。 */
export type MyPageSegment = "kifu" | "problems" | "favorites" | "training";

const SEGMENTS = [
  ["kifu", "牌譜"],
  ["problems", "何切る"],
  ["favorites", "お気に入り"],
  ["training", "特訓"],
] as const;

/**
 * マイページ。上部の Segment で「牌譜（マイ半荘一覧）/ 何切る（マイ問題管理）/
 * お気に入り（★を付けた牌譜・何切る）/ 特訓（クイズ履歴+グラフ。本人のみ）」を切り替える。
 * 選択状態は親（HomeTabs）が持つ制御コンポーネント（何切る公開一覧の「マイ何切る」導線から
 * 何切るセグメントを直接開けるようにするため）。
 */
export function MyPageScreen({
  segment,
  onChangeSegment,
}: {
  segment: MyPageSegment;
  onChangeSegment: (segment: MyPageSegment) => void;
}) {
  return (
    <View style={styles.root}>
      <AppBar title="マイページ" />
      <View style={styles.segRow}>
        <Segment options={SEGMENTS} value={segment} onChange={onChangeSegment} />
      </View>
      {segment === "kifu" ? (
        <MyListScreen />
      ) : segment === "problems" ? (
        <MyProblemsScreen />
      ) : segment === "favorites" ? (
        <MyFavoritesScreen />
      ) : (
        <MyTrainingScreen />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 10 },
});
