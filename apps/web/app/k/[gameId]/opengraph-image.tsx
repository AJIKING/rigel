import { ImageResponse } from "next/og";
import { STAR_COLOR, STAR_PATH } from "../../../components/StarMark";
import { getPublicGameDetail } from "../../../lib/api-server";
import { loadNotoSansJP } from "../../../lib/og-assets";
import { ogCard } from "../../../lib/og-meta";

// /k/[gameId] の動的OG画像（SNSカード）。next/og(satori) でテキストカードを生成する。
// 非公開・不存在の半荘は ogCard(null) の汎用カードになり、半荘情報を一切漏らさない。
// 和文フォントの取得失敗時は内蔵欧文フォントで描画を継続する（lib/og-assets）。

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "麻雀牌譜 | Rigel";

export default async function OgImage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const card = ogCard(await getPublicGameDetail(gameId).catch(() => null));
  const byline = card.author ? `by ${card.author}` : "";
  const [bold, regular] = await Promise.all([
    loadNotoSansJP(card.title, 700),
    loadNotoSansJP(`${card.info}${byline}RIGEL`, 400),
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
        <svg width={46} height={46} viewBox="0 0 24 24" fill="none">
          <path d={STAR_PATH} fill={STAR_COLOR} />
        </svg>
        <div style={{ fontSize: 38, letterSpacing: 10 }}>RIGEL</div>
      </div>
      <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.3, lineClamp: 3 }}>
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
        <div>{card.info}</div>
        {byline ? <div>{byline}</div> : null}
      </div>
    </div>,
    {
      ...size,
      // 空配列は @vercel/og の `options.fonts || defaultFonts` で truthy 扱いになり
      // 内蔵フォントまで消えて throw するため、未取得時は undefined にして内蔵で描く。
      fonts: fonts.length > 0 ? fonts : undefined,
      // 半荘のOG画像は共有後ほぼ不変。エッジ/クローラーに再利用させ、
      // 再スクレイプごとの satori 描画とフォント取得を省く（タイトル変更は1日で追従）。
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
