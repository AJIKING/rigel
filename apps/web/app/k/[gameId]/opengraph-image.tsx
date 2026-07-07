import { ImageResponse } from "next/og";
import { getPublicGameDetail } from "../../../lib/api-server";
import { ogCard } from "../../../lib/og-meta";

// /k/[gameId] の動的OG画像（SNSカード）。next/og(satori) でテキストカードを生成する。
// 非公開・不存在の半荘は ogCard(null) の汎用カードになり、半荘情報を一切漏らさない。
// 和文フォントは Google Fonts からカード文言ぶんだけサブセット取得する（数KB。
// 送るのは公開半荘の文言のみ）。取得失敗時は内蔵欧文フォントで描画を継続する。

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "麻雀牌譜 | rigel";

async function loadNotoSansJP(text: string, weight: 400 | 700): Promise<ArrayBuffer | null> {
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

export default async function OgImage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const card = ogCard(await getPublicGameDetail(gameId).catch(() => null));
  const tagline = card.info ?? "麻雀の牌譜をブラウザで再生";
  const byline = card.author ? `by ${card.author}` : "";
  const [bold, regular] = await Promise.all([
    loadNotoSansJP(card.title, 700),
    loadNotoSansJP(`${tagline}${byline}RIGEL`, 400),
  ]);
  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 700 }[] = [];
  if (bold) fonts.push({ name: "NotoSansJP", data: bold, weight: 700 });
  if (regular) fonts.push({ name: "NotoSansJP", data: regular, weight: 400 });

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 64,
        background: "linear-gradient(135deg, #0d735a 0%, #073b2d 100%)",
        color: "#ffffff",
        fontFamily: "NotoSansJP",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {/* StarMark と同じパス（オレンジ5角星） */}
        <svg width={46} height={46} viewBox="0 0 24 24" fill="none">
          <path
            d="M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z"
            fill="#ff9e45"
          />
        </svg>
        <div style={{ display: "flex", fontSize: 38, letterSpacing: 10 }}>RIGEL</div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 68,
          fontWeight: 700,
          lineHeight: 1.3,
          lineClamp: 3,
        }}
      >
        {card.title}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 32,
          color: "rgba(255,255,255,0.88)",
        }}
      >
        <div style={{ display: "flex" }}>{tagline}</div>
        {byline ? <div style={{ display: "flex" }}>{byline}</div> : null}
      </div>
    </div>,
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
