import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth";

WebBrowser.maybeCompleteAuthSession();

const CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({ clientId: CLIENT_ID });

  // Google から id_token が返ったらサーバ認証へ。
  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      if (idToken) void signInWithGoogle(idToken).catch(() => undefined);
    }
  }, [response, signInWithGoogle]);

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.brand}>rigel</Text>
        <Text style={styles.tag}>麻雀牌譜を、写真から</Text>
        <Text style={styles.desc}>
          牌譜の保存・共有には Google ログインが必要です。保存済み牌譜の閲覧はログイン不要です。
        </Text>
        {CLIENT_ID ? (
          <Pressable
            style={({ pressed }) => [styles.btn, (!request || pressed) && styles.btnPressed]}
            disabled={!request}
            onPress={() => void promptAsync()}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>Google でログイン</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>
            Google ログインは未設定です（EXPO_PUBLIC_GOOGLE_CLIENT_ID を設定すると有効化）。
          </Text>
        )}
        {!request && CLIENT_ID ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 360,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 24,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  brand: { fontSize: 28, fontWeight: "800", letterSpacing: 1 },
  tag: { color: "#888", fontSize: 13, marginTop: 2, marginBottom: 16 },
  desc: { color: "#555", fontSize: 14, lineHeight: 22, marginBottom: 16, textAlign: "center" },
  btn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#dadce0",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  btnPressed: { opacity: 0.6 },
  btnText: { fontSize: 14, fontWeight: "600", color: "#333" },
  note: { color: "#888", fontSize: 12, textAlign: "center" },
});
