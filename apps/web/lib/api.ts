// web → api（Workers）クライアント。実体は共有の @rigel/client。
// ベースURLは NEXT_PUBLIC_API_URL（未設定なら同一オリジン）。

import { createApiClient } from "@rigel/client";

export type { AnalyzeResult, AuthUser, Game, GameDetail, GameLog } from "@rigel/client";

const client = createApiClient(process.env.NEXT_PUBLIC_API_URL ?? "");

export const { authWithGoogle, fetchMe, getGames, getGame, analyze, updateKifu } = client;
