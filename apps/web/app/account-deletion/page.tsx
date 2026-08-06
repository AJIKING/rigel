import { AccountDeletionScreen } from "../../components/AccountDeletionScreen";

export const metadata = {
  title: "アカウントの削除",
  description: "RAISHA のアカウントと関連データの削除手順。",
  alternates: { canonical: "/account-deletion" },
};

export default function AccountDeletionPage() {
  return <AccountDeletionScreen />;
}
