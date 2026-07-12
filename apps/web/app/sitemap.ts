import type { MetadataRoute } from "next";
import { getPublicGames, getPublicProblems } from "../lib/api-server";
import { siteBaseUrl } from "../lib/og-meta";
import { buildSitemap } from "../lib/seo";

// sitemap.xml: 静的な公開ページ＋公開半荘（/k）・公開何切る（/p）。
// API が落ちていても sitemap 自体は静的ページだけで返す（クロールを止めない）。
// ビルド時に焼くと公開一覧が古いまま固まるので、リクエスト時に生成する。
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [games, problems] = await Promise.all([
    getPublicGames().catch(() => []),
    getPublicProblems().catch(() => []),
  ]);
  return buildSitemap(siteBaseUrl(), {
    games: games.map((g) => ({ id: g.id, createdAt: g.createdAt })),
    problems: problems.map((p) => ({ id: p.id, createdAt: p.createdAt })),
  });
}
