import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AuthProvider, useAuth } from "./lib/auth";
import type { RootStackParamList } from "./lib/navigation";
import { BoardScreen } from "./screens/BoardScreen";
import { CaptureScreen } from "./screens/CaptureScreen";
import { GameDetailScreen } from "./screens/GameDetailScreen";
import { GamesListScreen } from "./screens/GamesListScreen";
import { LoginScreen } from "./screens/LoginScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

function LogoutButton() {
  const { signOut } = useAuth();
  return (
    <Pressable onPress={signOut} accessibilityRole="button" hitSlop={8}>
      <Text style={styles.logout}>ログアウト</Text>
    </Pressable>
  );
}

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <LoginScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="GamesList"
          component={GamesListScreen}
          options={{ title: "牌譜（半荘）", headerRight: () => <LogoutButton /> }}
        />
        <Stack.Screen name="GameDetail" component={GameDetailScreen} options={{ title: "半荘" }} />
        <Stack.Screen name="Board" component={BoardScreen} options={{ title: "牌譜" }} />
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: "撮影" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  logout: { color: "#333", fontSize: 13 },
});
