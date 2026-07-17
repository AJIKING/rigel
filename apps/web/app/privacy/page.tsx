import { PrivacyScreen } from "../../components/PrivacyScreen";

export const metadata = {
  title: "プライバシーポリシー",
  description: "RIGEL のプライバシーポリシー。",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PrivacyScreen />;
}
