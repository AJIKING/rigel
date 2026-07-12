import { TermsScreen } from "../../components/TermsScreen";

export const metadata = {
  title: "利用規約",
  description: "Rigel の利用規約。",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <TermsScreen />;
}
