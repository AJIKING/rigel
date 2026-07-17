import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { BrandMark } from "../components/BrandMark";
import { TileChip } from "../components/TileChip";
import { useAuth } from "../lib/auth";
import { googleClientConfig } from "../lib/google-login";
import { colors, radius } from "../lib/theme";

WebBrowser.maybeCompleteAuthSession();

// EXPO_PUBLIC_GOOGLE_CLIENT_ID は iOS 用、EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID は
// Android 用の OAuth クライアントID（詳細は lib/google-login.ts）。未設定なら null = ログイン無効表示。
const GOOGLE_CONFIG = googleClientConfig({
  clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
});

function GoogleLogo() {
  return (
    <Svg width={19} height={19} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

export function LoginScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_CONFIG ?? {});

  // Google から id_token が返ったらサーバ認証へ。
  useEffect(() => {
    if (response?.type === "success") {
      const idToken = response.params.id_token;
      if (idToken) void signInWithGoogle(idToken).catch(() => undefined);
    }
  }, [response, signInWithGoogle]);

  // Sign in with Apple（iOS のみ。App Store 審査要件 4.8）。identityToken でサーバ認証し、
  // authorizationCode は退会時のトークン失効（revoke）用に api 側で refresh token に交換する。
  async function onApplePress() {
    try {
      const cred = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (cred.identityToken) {
        await signInWithApple(cred.identityToken, cred.authorizationCode ?? undefined);
      }
    } catch {
      // キャンセル（ERR_REQUEST_CANCELED）を含め黙って戻る（ボタンの再押下でやり直せる。
      // Google 側の .catch(() => undefined) と同じ流儀）。
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.inner}>
        <TileChip size={104} center="star" />
        <View style={styles.brand}>
          <BrandMark size={30} fontSize={29} letterSpacing={7.5} />
        </View>
      </View>
      <View style={styles.foot}>
        {GOOGLE_CONFIG ? (
          <Pressable
            style={({ pressed }) => [styles.gbtn, (!request || pressed) && styles.gbtnPressed]}
            disabled={!request}
            onPress={() => void promptAsync()}
            accessibilityRole="button"
          >
            <GoogleLogo />
            <Text style={styles.gbtnText}>Google でログイン</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>
            Google ログインは未設定です（EXPO_PUBLIC_GOOGLE_CLIENT_ID を設定すると有効化）。
          </Text>
        )}
        {/* Sign in with Apple（iOS のみ・純正ボタン必須=HIG）。Android には出さない
            （Play に同種の要件は無い）。 */}
        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.base}
            style={styles.abtn}
            onPress={() => void onApplePress()}
          />
        ) : null}
        {!request && GOOGLE_CONFIG ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : null}
        <Text style={styles.legal}>
          続行すると利用規約とプライバシーに同意したものとみなされます。
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 30 },
  brand: { marginTop: 24 },
  foot: { paddingHorizontal: 30, paddingBottom: 30 },
  gbtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    backgroundColor: "#fff",
    borderRadius: radius.base,
    paddingVertical: 15,
  },
  gbtnPressed: { opacity: 0.85 },
  gbtnText: { color: "#1f1f1f", fontWeight: "700", fontSize: 15 },
  // Apple 純正ボタン（高さは HIG の最小 44pt 以上・Google ボタンと幅を揃える）。
  abtn: { height: 48, marginTop: 10 },
  note: { color: colors.w45, fontSize: 12, textAlign: "center" },
  legal: { color: colors.w45, fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 16 },
});
