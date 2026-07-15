// lib/og-assets — 動的OG画像（/k・/p の opengraph-image）が使う外部アセットの取得。
// いずれも「取得に失敗しても描画は継続する」方針（null / 欠落を返し、呼び出し側が
// フォールバックする）。OG画像はクローラー向けのベストエフォートで、落とさないことが最優先。

/** 和文フォントを Google Fonts からカード文言ぶんだけサブセット取得する（数KB。
 *  送るのは公開データの文言のみ）。取得失敗時は null（内蔵欧文フォントで継続）。 */
export async function loadNotoSansJP(text: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@${weight}&text=${encodeURIComponent(text)}`,
      )
    ).text();
    // UA なしの fetch には woff2 でなく truetype/opentype の URL が返る（satori が読める形式）。
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** 牌シンボルSVGを取得して data URI にする（satori の <img> 用）。
 *  1枚でも失敗したら null（呼び出し側は手牌なしのテキストカードへフォールバック）。 */
export async function loadTileImages(urls: string[]): Promise<string[] | null> {
  try {
    const images = await Promise.all(
      urls.map(async (url) => {
        const res = await fetch(url);
        if (!res.ok) return null;
        const svg = await res.text();
        return `data:image/svg+xml;base64,${btoa(svg)}`;
      }),
    );
    return images.every((i): i is string => i !== null) ? images : null;
  } catch {
    return null;
  }
}
