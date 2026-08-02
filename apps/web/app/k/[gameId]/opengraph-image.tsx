import type { Tile } from "@rigel/schema";
import { tileAssetName } from "@rigel/ui";
import { ImageResponse } from "next/og";
import type { CSSProperties } from "react";
import { STAR_COLOR, STAR_PATH } from "../../../components/StarMark";
import { getPublicGameDetail } from "../../../lib/api-server";
import { BRAND } from "../../../lib/brand";
import { loadOgFonts, loadTileImages } from "../../../lib/og-assets";
import { ogCard, siteBaseUrl, siteHost } from "../../../lib/og-meta";

// /k/[gameId] の動的OG画像（SNSカード）。next/og(satori) で描く。
// 構図: ブランド行（★RAISHA + ドメインピル）→ タイトル + 実牌の扇 → 情報行。
// 非公開・不存在の半荘は ogCard(null) の汎用カードになり、半荘情報を一切漏らさない。
// 和文フォント・牌SVG の取得失敗時はテキストのみで描画を継続する（lib/og-assets）。

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `麻雀牌譜 | ${BRAND}`;

/** 右側の飾り牌（実牌アセット。データ非依存で常に同じ＝東・中・赤五萬）。 */
const DECOR_TILES: readonly Tile[] = ["1z", "7z", "0m"];
const DECOR_STYLES: CSSProperties[] = [
  { transform: "rotate(-10deg) translateY(14px)" },
  { transform: "rotate(2deg) translateY(-12px)", marginLeft: -24 },
  { transform: "rotate(13deg) translateY(18px)", marginLeft: -24 },
];

export default async function OgImage({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const card = ogCard(await getPublicGameDetail(gameId).catch(() => null));
  const byline = card.author ? `by ${card.author}` : "";
  const host = siteHost();
  // 第2引数はフォントサブセットの字種列。カードに描く全テキスト（ワードマーク・ドメイン含む）を渡す。
  const [fonts, tiles] = await Promise.all([
    loadOgFonts(card.title, `${card.info}${byline}${BRAND}${host}`),
    loadTileImages(DECOR_TILES.map((t) => `${siteBaseUrl()}/tiles/${tileAssetName(t)}.svg`)),
  ]);

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
        <div style={{ fontSize: 38, letterSpacing: 10 }}>{BRAND}</div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(255,255,255,0.92)",
            background: "rgba(0,0,0,0.28)",
            border: "2px solid rgba(255,255,255,0.30)",
            borderRadius: 999,
            padding: "8px 26px",
          }}
        >
          {host}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 48, flexGrow: 1 }}>
        <div
          style={{
            fontSize: 68,
            fontWeight: 700,
            lineHeight: 1.3,
            lineClamp: 3,
            flexGrow: 1,
            flexShrink: 1,
          }}
        >
          {card.title}
        </div>
        {tiles ? (
          <div style={{ display: "flex", alignItems: "center", flexShrink: 0, padding: "0 12px" }}>
            {tiles.map((src, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 118,
                  height: 162,
                  borderRadius: 14,
                  background: "#f6f1e7",
                  boxShadow: "0 8px 0 rgba(0,0,0,0.35)",
                  ...DECOR_STYLES[i],
                }}
              >
                <img src={src} alt="" width={94} height={132} />
              </div>
            ))}
          </div>
        ) : null}
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
