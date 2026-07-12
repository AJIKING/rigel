// lib/og-meta — 公開ビューアの OGP/Twitter メタデータを組み立てる純粋関数。
// 非公開・不存在（null）ではサイト既定にフォールバックし、半荘情報を一切含めない
//（プライバシー: 非公開半荘の存在をメタデータから漏らさない）。

import { fmtDateSlash } from "./format";

/** メタデータに必要な最小限の公開半荘情報（PublicGameDetail のサブセット）。 */
export interface PublicGameSummary {
  game: { id: string; title: string; createdAt: string };
  owner: { id: string; handle: string | null; displayName: string };
  logs: readonly unknown[];
}

/** Next.js の Metadata に構造的に代入できる共有メタデータ（テストで card 等へ直接
 *  アクセスできるよう、union の広い Metadata 型ではなく必要形だけを持つ）。 */
export interface ShareMetadata {
  title: string;
  description: string;
  openGraph?: {
    title: string;
    description: string;
    siteName: string;
    url: string;
    type: "article";
  };
  twitter?: { card: "summary_large_image"; title: string; description: string };
}

// サイト既定（root layout と共有する単一ソース）。
export const DEFAULT_TITLE = "麻雀牌譜";
export const DEFAULT_DESCRIPTION = "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する";

/** メタデータの絶対URL解決に使うサイトの基準URL。
 *  api-server.ts と同じ流儀で env（空文字は未設定扱い）→ 本番ドメインの順に解決する。 */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://rigel.plaria.co.jp";
}

/** ビューアと同じ無題表記。 */
const UNTITLED = "（無題の半荘）";

/** ビューアと同じ作者表記（handle が無ければ id 先頭6文字）。 */
function authorOf(owner: PublicGameSummary["owner"]): string {
  return `@${owner.handle ?? owner.id.slice(0, 6)}`;
}

/** ビューアと同じタイトル表記（空タイトルは無題）。 */
function titleOf(detail: PublicGameSummary): string {
  return detail.game.title || UNTITLED;
}

/** 半荘の要約文言「全N局・YYYY/MM/DD」。description と OG 画像カードで共用する。 */
function gameInfo(detail: PublicGameSummary): string {
  return `全${detail.logs.length}局・${fmtDateSlash(detail.game.createdAt)}`;
}

/** 公開半荘の共有メタデータ（<title>・description・OGP/Twitter カード）。 */
export function buildGameMetadata(detail: PublicGameSummary | null): ShareMetadata {
  if (!detail) return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
  const title = titleOf(detail);
  const description = `${authorOf(detail.owner)} の牌譜（${gameInfo(detail)}）をブラウザで再生できます。`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: "Rigel",
      url: `/k/${detail.game.id}`,
      type: "article",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** OG 画像カードの文言（タイトル・作者・局数/日付）。カードの全文言をここで一元化し、
 *  画像レンダラ（opengraph-image）はレイアウトだけを担う。 */
export function ogCard(detail: PublicGameSummary | null): {
  title: string;
  author: string | null;
  info: string;
} {
  if (!detail) return { title: "麻雀牌譜", author: null, info: "麻雀の牌譜をブラウザで再生" };
  return { title: titleOf(detail), author: authorOf(detail.owner), info: gameInfo(detail) };
}
