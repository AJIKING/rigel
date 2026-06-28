// mobile → api（Workers）クライアント。実体は共有の @rigel/client。
// ベースURLは EXPO_PUBLIC_API_URL。

import { createApiClient } from "@rigel/client";

export type { AnalyzeResult, AuthUser, Game, GameDetail, GameLog } from "@rigel/client";

const client = createApiClient(process.env.EXPO_PUBLIC_API_URL ?? "");

export const { authWithGoogle, fetchMe, getGames, getGame, analyze, createCheckout } = client;
