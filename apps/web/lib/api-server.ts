// サーバ（Server Component / Route Handler / Server Action）専用の api クライアント。
//
// クライアント版（lib/api.ts）は baseUrl に `NEXT_PUBLIC_API_URL ?? ""` を使い、
// 空文字なら相対 URL（同一オリジン）になる。ブラウザでは動くが、サーバ側 fetch は
// 相対 URL を解決できず throw する。そこでサーバでは必ず絶対 URL を使う。
//
// 解決順: API_URL（server 専用・任意）→ NEXT_PUBLIC_API_URL（ビルド時に焼かれる公開値）
//         → 既定の本番 api（deploy.web.yml の既定と一致）。
// 空文字は「未設定」とみなすため ?? ではなく || で連結する。

import "server-only";
import { createApiClient } from "@rigel/client";

export function serverApiBaseUrl(): string {
  return (
    process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "https://rigel-api.plaria.workers.dev"
  );
}

const serverClient = createApiClient(serverApiBaseUrl());

// サーバ（Route Handler / Server Action / Server Component）から Workers api を
// 叩くための一式。認証が要るものは Cookie 由来のトークンを Bearer に渡して使う。
export const {
  authWithGoogle,
  fetchMe,
  getPublicGameDetail,
  getGame,
  getMyGames,
  getPublicProfile,
  getPublicGames,
  updateKifu,
  setVisibility,
  deleteKifu,
  createGame,
  createEmptyKifu,
  analyze,
  updateProfile,
  createCheckout,
  deleteAccount,
} = serverClient;
