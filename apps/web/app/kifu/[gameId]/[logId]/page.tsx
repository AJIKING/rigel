"use client";

import { useParams } from "next/navigation";
import { BoardEditor } from "../../../../components/board/BoardEditor";

export default function BoardPage() {
  const { gameId, logId } = useParams<{ gameId: string; logId: string }>();
  return <BoardEditor gameId={gameId} logId={logId} />;
}
