import { SettingsShell } from "../../components/account/SettingsShell";

// 本人専用ページ。検索結果に載せない。
export const metadata = {
  title: "設定",
  robots: { index: false },
};

export default function SettingsPage() {
  return <SettingsShell />;
}
