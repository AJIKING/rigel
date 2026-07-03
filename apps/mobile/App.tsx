import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./lib/auth";
import type { RootStackParamList } from "./lib/navigation";
import { colors } from "./lib/theme";
import { BoardScreen } from "./screens/BoardScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { GameDetailScreen } from "./screens/GameDetailScreen";
import { HomeTabs } from "./screens/HomeTabs";
import { LoginScreen } from "./screens/LoginScreen";
import { PublicGameScreen } from "./screens/PublicGameScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

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

const headerOptions = {
  headerStyle: { backgroundColor: colors.chrome },
  headerTintColor: colors.white,
  headerTitleStyle: { color: colors.white },
} as const;

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={headerOptions}>
        <Stack.Screen name="Home" component={HomeTabs} options={{ headerShown: false }} />
        <Stack.Screen name="GameDetail" component={GameDetailScreen} options={{ title: "半荘" }} />
        <Stack.Screen name="Board" component={BoardScreen} options={{ title: "牌譜" }} />
        <Stack.Screen
          name="PublicGame"
          component={PublicGameScreen}
          options={{ title: "公開牌譜" }}
        />
        <Stack.Screen
          name="Capture"
          component={CaptureScreen}
          options={{ title: "撮影して作成" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
        <StatusBar style="light" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
});
