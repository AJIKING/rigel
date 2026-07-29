import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar, type MainTab } from "../components/TabBar";
import { colors } from "../lib/theme";
import { MyPageScreen, type MyPageSegment } from "./MyPageScreen";
import { ProblemsListScreen } from "./ProblemsListScreen";
import { PublicListScreen } from "./PublicListScreen";
import { SettingsScreen } from "./SettingsScreen";
import { TrainingScreen } from "./TrainingScreen";

/**
 * ボトムタブのコンテナ。牌譜（公開一覧）/ 何切る（公開一覧）/ 特訓 / マイページ / 設定を切り替える。
 * マイページ内のセグメント（牌譜/何切る）もここで保持する（タブを跨いでも選択を維持）。
 */
export function HomeTabs() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MainTab>("pub");
  const [mySegment, setMySegment] = useState<MyPageSegment>("kifu");

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top, backgroundColor: colors.chrome }} />
      <View style={styles.content}>
        {tab === "pub" && <PublicListScreen />}
        {tab === "problems" && <ProblemsListScreen />}
        {tab === "training" && <TrainingScreen onOpenSettings={() => setTab("set")} />}
        {tab === "my" && <MyPageScreen segment={mySegment} onChangeSegment={setMySegment} />}
        {tab === "set" && <SettingsScreen />}
      </View>
      <TabBar active={tab} onSelect={setTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
