import { StyleSheet, View } from "react-native";
import { AppBar } from "../components/AppBar";
import { Segment } from "../components/Segment";
import { colors } from "../lib/theme";
import { MyListScreen } from "./MyListScreen";
import { MyProblemsScreen } from "./MyProblemsScreen";

/** マイページの表示対象（牌譜=自分の半荘 / 何切る=自分の問題）。 */
export type MyPageSegment = "kifu" | "problems";

const SEGMENTS = [
  ["kifu", "牌譜"],
  ["problems", "何切る"],
] as const;

/**
 * マイページ。上部の Segment で「牌譜（マイ半荘一覧）/ 何切る（マイ問題管理）」を切り替える。
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
      {segment === "kifu" ? <MyListScreen /> : <MyProblemsScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  segRow: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 10 },
});
