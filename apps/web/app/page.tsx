import { LandingScreen } from "../components/LandingScreen";

// title/description は root layout の既定を使う。canonical だけ明示する。
export const metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return <LandingScreen />;
}
