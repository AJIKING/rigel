import { GoogleSignInButton } from "../../components/GoogleSignInButton";

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 420 }}>
      <h1>ログイン</h1>
      <p style={{ color: "#555", lineHeight: 1.7 }}>
        牌譜の保存・共有には Google ログインが必要です。保存済み牌譜の閲覧はログイン不要です。
      </p>
      <GoogleSignInButton />
    </div>
  );
}
