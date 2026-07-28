import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { BrandMark } from "../components/BrandMark";
import { TileChip } from "../components/TileChip";
import {
  APPLE_REDIRECT_URL,
  appleWebLoginConfig,
  buildAppleAuthorizeUrl,
  parseAppleCallbackUrl,
  type AppleWebLoginConfig,
} from "../lib/apple-login";
import { useAuth } from "../lib/auth";
import { googleClientConfig } from "../lib/google-login";
import { SITE_ORIGIN } from "../lib/site";
import { colors, radius } from "../lib/theme";

WebBrowser.maybeCompleteAuthSession();

// 文言はこの画面内で「サインイン」に統一する（Apple 純正ボタン（iOS）の規定文言
// 「Appleでサインイン」が変更不可のため、そちらに合わせる。[決定] 2026-07-29 オーナー）。

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

// Apple ロゴ（web の AppleSignInButton と同じパス。Android の自前ボタン用）。
function AppleLogo() {
  return (
    <Svg width={17} height={17} viewBox="0 0 170 170">
      <Path
        fill="#1f1f1f"
        d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.2-2.12-9.98-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.27 2.13-9.51 3.24-12.76 3.35-4.93.21-9.84-1.96-14.75-6.52-3.13-2.73-7.05-7.41-11.75-14.04-5.04-7.09-9.18-15.32-12.43-24.7-3.48-10.13-5.23-19.94-5.23-29.44 0-10.88 2.35-20.26 7.06-28.12 3.7-6.32 8.62-11.3 14.78-14.96 6.16-3.65 12.82-5.51 19.99-5.63 3.91 0 9.05 1.21 15.43 3.59 6.36 2.39 10.45 3.6 12.24 3.6 1.34 0 5.87-1.42 13.57-4.24 7.28-2.61 13.42-3.7 18.44-3.27 13.63 1.1 23.87 6.47 30.68 16.15-12.19 7.39-18.22 17.73-18.1 31 .11 10.34 3.86 18.94 11.23 25.77 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.12-2.97 15.7-8.88 22.72-7.13 8.35-15.76 13.17-25.12 12.41a25.3 25.3 0 0 1-.19-3.07c0-7.8 3.39-16.14 9.42-22.96 3.01-3.45 6.84-6.32 11.48-8.61C110.44 5.47 114.82 4.22 119 4c.12 1.08.11 2.16.11 3.24z"
      />
    </Svg>
  );
}

export function LoginScreen() {
  const { signInWithGoogle, signInWithApple, startGuest } = useAuth();

  // EXPO_PUBLIC_GOOGLE_CLIENT_ID は iOS 用、EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID は
  // Android 用の OAuth クライアントID（詳細は lib/google-login.ts）。未設定なら null =
  // サインイン無効表示。env は描画時に読む（appleWeb と同じ流儀。テストから差し替え可能に）。
  const googleConfig = googleClientConfig({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(googleConfig ?? {});

  // Android のみ: web フローの Sign in with Apple（docs/plans/android.md §12-B。iOS で
  // Apple 登録した人が Android でも同じアカウントに入れるように）。env は描画時に読む
  // （モジュール読込時だとテストから process.env を差し替えられない）。
  const appleWeb =
    Platform.OS === "android"
      ? appleWebLoginConfig({
          servicesId: process.env.EXPO_PUBLIC_APPLE_CLIENT_ID,
          apiUrl: process.env.EXPO_PUBLIC_API_URL,
        })
      : null;

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

  // Android の Apple ログイン: authorize URL を Custom Tabs で開き、api の中継
  // （/auth/apple/callback → アプリ scheme へ 302）から id_token を受け取る。
  // state はここで発行してコールバックで照合（不一致・エラー・キャンセルは黙って戻る）。
  async function onAppleWebPress(config: AppleWebLoginConfig) {
    try {
      const state = Crypto.randomUUID();
      const result = await WebBrowser.openAuthSessionAsync(
        buildAppleAuthorizeUrl(config, state),
        APPLE_REDIRECT_URL,
      );
      if (result.type !== "success") return;
      const parsed = parseAppleCallbackUrl(result.url, state);
      if (parsed) await signInWithApple(parsed.idToken, parsed.authorizationCode);
    } catch {
      // onApplePress（iOS）と同じ流儀: キャンセル含め黙って戻る。
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
        {googleConfig ? (
          <Pressable
            style={({ pressed }) => [styles.gbtn, (!request || pressed) && styles.gbtnPressed]}
            disabled={!request}
            onPress={() => void promptAsync()}
            accessibilityRole="button"
          >
            <GoogleLogo />
            <Text style={styles.gbtnText}>Google でサインイン</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>
            Google サインインは未設定です（EXPO_PUBLIC_GOOGLE_CLIENT_ID を設定すると有効化）。
          </Text>
        )}
        {/* Sign in with Apple。iOS は純正ボタン（HIG 要件）、Android は自前ボタン＋
            web フロー（EXPO_PUBLIC_APPLE_CLIENT_ID 未設定なら出さない）。 */}
        {Platform.OS === "ios" ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={radius.base}
            style={styles.abtn}
            onPress={() => void onApplePress()}
          />
        ) : appleWeb ? (
          <Pressable
            style={({ pressed }) => [styles.gbtn, styles.abtnWeb, pressed && styles.gbtnPressed]}
            onPress={() => void onAppleWebPress(appleWeb)}
            accessibilityRole="button"
            accessibilityLabel="Apple でサインイン"
          >
            <AppleLogo />
            <Text style={styles.gbtnText}>Apple でサインイン</Text>
          </Pressable>
        ) : null}
        {!request && googleConfig ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : null}
        {/* サインイン必須のアプリではない（公開牌譜・何切るは見られる）。ゲスト開始の導線。 */}
        <Pressable
          style={({ pressed }) => [styles.guestBtn, pressed && styles.gbtnPressed]}
          onPress={() => startGuest()}
          accessibilityRole="button"
        >
          <Text style={styles.guestText}>サインインしないではじめる</Text>
        </Pressable>
        {/* 利用規約は web の規約ページをアプリ内ブラウザで開く（mobile に規約画面は持たない）。 */}
        <Text style={styles.legal}>
          サインインすると
          <Text
            style={styles.legalLink}
            onPress={() => void WebBrowser.openBrowserAsync(`${SITE_ORIGIN}/terms`)}
            accessibilityRole="link"
          >
            利用規約
          </Text>
          に同意したものとみなされます。
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
  // Android の自前 Apple ボタン（Google ボタンと同じ白地・純正と同じ間隔）。
  abtnWeb: { marginTop: 10 },
  note: { color: colors.w45, fontSize: 12, textAlign: "center" },
  // ゲスト開始はボタンの見た目を弱く（主導線はサインイン。テキストリンク相当）。
  guestBtn: { marginTop: 14, alignItems: "center", paddingVertical: 6 },
  guestText: { color: colors.w70, fontSize: 13, fontWeight: "700" },
  legal: { color: colors.w45, fontSize: 11, lineHeight: 19, textAlign: "center", marginTop: 16 },
  legalLink: { color: colors.w70, textDecorationLine: "underline" },
});
