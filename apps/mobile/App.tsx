import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./lib/auth";
import type { RootStackParamList } from "./lib/navigation";
import { AnalysisJobProvider } from "./lib/use-analysis-job";
import { configurePurchases } from "./lib/purchases";
import { colors } from "./lib/theme";
import { BoardScreen } from "./screens/BoardScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { EditScreen } from "./screens/EditScreen";
import { GameDetailScreen } from "./screens/GameDetailScreen";
import { HomeTabs } from "./screens/HomeTabs";
import { LoginScreen } from "./screens/LoginScreen";
import { ProblemAnswerScreen } from "./screens/ProblemAnswerScreen";
import { ProblemEditScreen } from "./screens/ProblemEditScreen";
import { PublicGameScreen } from "./screens/PublicGameScreen";
import { PublicUserScreen } from "./screens/PublicUserScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// RevenueCat（アプリ内課金）。キー未設定（Expo Go / CI）では何もしない。
configurePurchases();

// ダークテーマ（docs/rigel-mobile4.html のトーンに合わせる）。
const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.chrome,
    text: colors.white,
    border: colors.line,
    primary: colors.accent,
  },
};

// スタック画面のヘッダー（タブ画面の Toolbar とトーンを揃える）:
// 戻るは矢印のみ（iOS 既定の前画面名「Home」を出さない）・影/境界なし・タイトルは中央。
const headerOptions = {
  headerStyle: { backgroundColor: colors.chrome },
  headerTintColor: colors.white,
  headerTitleStyle: { color: colors.white, fontSize: 16, fontWeight: "700" },
  headerTitleAlign: "center",
  headerBackButtonDisplayMode: "minimal",
  headerShadowVisible: false,
} as const;

function Root() {
  const { user, guest, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  // サインイン必須にしない: ゲスト（サインインしないではじめる）でもホームへ入れる。
  // 認証が要る画面は各自が案内を出す。設定の「サインインする」（endGuest）でここへ戻る。
  if (!user && !guest) return <LoginScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerOptions}>
        <Stack.Screen name="Home" component={HomeTabs} options={{ headerShown: false }} />
        <Stack.Screen name="GameDetail" component={GameDetailScreen} options={{ title: "半荘" }} />
        <Stack.Screen name="Board" component={BoardScreen} options={{ title: "牌譜" }} />
        <Stack.Screen name="Edit" component={EditScreen} options={{ title: "牌譜を編集" }} />
        <Stack.Screen
          name="PublicGame"
          component={PublicGameScreen}
          options={{ title: "公開牌譜" }}
        />
        <Stack.Screen
          name="PublicUser"
          component={PublicUserScreen}
          options={{ title: "ユーザー" }}
        />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ title: "撮影して作成" }}
        />
        <Stack.Screen
          name="ProblemAnswer"
          component={ProblemAnswerScreen}
          options={{ title: "何切る" }}
        />
        <Stack.Screen
          name="ProblemEdit"
          component={ProblemEditScreen}
          options={{ title: "問題を編集" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* 解析ジョブのポーリングはアプリ全体で一本（開き直しの復元もここ。plan 8-2）。 */}
        <AnalysisJobProvider>
          <Root />
          <StatusBar style="light" />
        </AnalysisJobProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
