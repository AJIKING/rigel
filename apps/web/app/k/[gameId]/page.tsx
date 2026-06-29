"use client";

import { useParams } from "next/navigation";
import { KifuViewer } from "../../../components/view/KifuViewer";

export default function PublicGameViewPage() {
  const { gameId } = useParams<{ gameId: string }>();
  return <KifuViewer gameId={gameId} />;
}
