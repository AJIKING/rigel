import { tileAssetName } from "@rigel/ui";
import { ImageResponse } from "next/og";
import { STAR_COLOR, STAR_PATH } from "../../../components/StarMark";
import { getProblem } from "../../../lib/api-server";
import { BRAND } from "../../../lib/brand";
import { loadOgFonts, loadTileImages } from "../../../lib/og-assets";
import { problemOgCard, siteBaseUrl, siteHost } from "../../../lib/og-meta";

// /p/[id] の動的OG画像（SNSカード）。/k と同じ next/og(satori) 流儀で、
// 何切るは「手牌そのもの」をカードに描く（何の問題かが共有先で一目で伝わる）。
// トークンなしの getProblem は published のみ返るため、下書き・不存在は
// problemOgCard(null) の汎用カードになり、問題情報を一切漏らさない。
// 牌SVG・和文フォントの取得失敗時は手牌なしのテキストカードで描画を継続する。

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `何切る | ${BRAND}`;

const TILE_W = 68;
const TILE_H = 92;

export default async function OgImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = problemOgCard(await getProblem(id).catch(() => null));

  // 手牌＋ツモ牌のシンボルSVGを data URI へ（1枚でも失敗したらテキストカードに落とす）。
  const tiles = [...card.hand, ...(card.drawn ? [card.drawn] : [])];
  const images =
    tiles.length > 0
      ? await loadTileImages(tiles.map((t) => `${siteBaseUrl()}/tiles/${tileAssetName(t)}.svg`))
      : null;

  const host = siteHost();
  // 第2引数はフォントサブセットの字種列。カードに描く全テキスト（ワードマーク・ドメイン含む）を渡す。
  const fonts = await loadOgFonts(card.title, `${card.info}あなたなら何を切る？${BRAND}${host}`);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 56,
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
      <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.3, lineClamp: 2 }}>
        {card.title}
      </div>
      {images ? (
        <div style={{ display: "flex", alignItems: "center" }}>
          {images.map((src, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: TILE_W,
                height: TILE_H,
                borderRadius: 8,
                background: "#f6f1e7",
                boxShadow: "0 3px 0 rgba(0,0,0,0.35)",
                // ツモ牌は少し離して「14枚目」を示す（画面の手牌行と同じ見せ方）。
                marginLeft: i === 0 ? 0 : i === card.hand.length ? 24 : 5,
              }}
            >
              <img src={src} alt="" width={TILE_W - 14} height={TILE_H - 14} />
            </div>
          ))}
        </div>
      ) : null}
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
        {/* 汎用カードは info が長文のため、キャッチコピーは手牌つきカードだけに出す。 */}
        {images ? <div>あなたなら何を切る？</div> : null}
      </div>
    </div>,
    {
      ...size,
      // 空配列は @vercel/og の `options.fonts || defaultFonts` で truthy 扱いになり
      // 内蔵フォントまで消えて throw するため、未取得時は undefined にして内蔵で描く。
      fonts: fonts.length > 0 ? fonts : undefined,
      // 問題は公開後ほぼ不変。エッジ/クローラーに再利用させる（タイトル変更は1日で追従）。
      headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}
