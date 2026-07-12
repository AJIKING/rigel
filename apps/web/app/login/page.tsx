import { LoginScreen } from "../../components/LoginScreen";

// ログイン画面は検索結果に載せない（要ログインページからのリダイレクト先でもある）。
export const metadata = {
  title: "ログイン",
  robots: { index: false },
};

export default function LoginPage() {
  return <LoginScreen />;
}
