import type { MetadataRoute } from "next";
import { getPublicGames, getPublicProblems } from "../lib/api-server";
import { siteBaseUrl } from "../lib/og-meta";
import { collectPages } from "../lib/pagination";
import { buildSitemap } from "../lib/seo";

/** sitemap に載せる公開コンテンツの上限（実装既定値。Plan: docs/plans/list-pagination.md 3-7。
 *  それ以上は個別ページの被リンクに任せる）。 */
const SITEMAP_MAX = 200;

// sitemap.xml: 静的な公開ページ＋公開半荘（/k）・公開何切る（/p）。
// API が落ちていても sitemap 自体は静的ページだけで返す（クロールを止めない）。
// ビルド時に焼くと公開一覧が古いまま固まるので、リクエスト時に生成する。
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, problems] = await Promise.all([
    collectPages((cursor) => getPublicGames(cursor), SITEMAP_MAX).catch(() => []),
    collectPages((cursor) => getPublicProblems(cursor), SITEMAP_MAX).catch(() => []),
  ]);
  return buildSitemap(siteBaseUrl(), {
    games: games.map((g) => ({ id: g.id, createdAt: g.createdAt })),
    problems: problems.map((p) => ({ id: p.id, createdAt: p.createdAt })),
  });
}
