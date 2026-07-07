import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBar, type MainTab } from "../components/TabBar";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { MyListScreen } from "./MyListScreen";
import { ProblemsListScreen } from "./ProblemsListScreen";
import { PublicListScreen } from "./PublicListScreen";
import { SettingsScreen } from "./SettingsScreen";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

/** ボトムタブのコンテナ。公開/マイ牌譜/何切る/設定を切替え、作成タブは撮影フローへ。 */
export function HomeTabs() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<MainTab>("pub");

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top, backgroundColor: colors.chrome }} />
      <View style={styles.content}>
        {tab === "pub" && <PublicListScreen />}
        {tab === "mine" && <MyListScreen />}
        {tab === "problems" && <ProblemsListScreen />}
        {tab === "set" && <SettingsScreen />}
      </View>
      <TabBar active={tab} onSelect={setTab} onCreate={() => nav.navigate("Capture")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
});
