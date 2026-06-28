import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginScreen } from "./screens/LoginScreen";
import { MainScreen } from "./screens/MainScreen";

function Root() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  return user ? <MainScreen /> : <LoginScreen />;
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
});
