// lib/seo — sitemap のエントリを組み立てる純粋関数。
// 載せるのは公開ページだけ（/ /kifu /problems /terms と公開半荘 /k/[gameId]・
// 公開何切る /p/[id]）。非公開・要ログインのページは載せない。

/** sitemap に必要な最小限の公開アイテム情報。 */
export interface SitemapItem {
  id: string;
  createdAt: string;
}

export interface SitemapEntry {
  url: string;
  lastModified?: string;
}

/** 静的な公開ルート。 */
const STATIC_ROUTES = ["/", "/kifu", "/problems", "/terms"] as const;

/** 公開ページ一覧から sitemap エントリを組み立てる。 */
export function buildSitemap(
  baseUrl: string,
  items: { games: SitemapItem[]; problems: SitemapItem[] },
): SitemapEntry[] {
  return [
    ...STATIC_ROUTES.map((path) => ({ url: `${baseUrl}${path}` })),
    ...items.games.map((g) => ({ url: `${baseUrl}/k/${g.id}`, lastModified: g.createdAt })),
    ...items.problems.map((p) => ({ url: `${baseUrl}/p/${p.id}`, lastModified: p.createdAt })),
  ];
}
