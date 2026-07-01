import type { MetadataRoute } from "next";

// PWA マニフェスト（/manifest.webmanifest として配信される）。
// アイコンの実体は public/icons/ 以下。favicon.ico / icon.svg / apple-icon.png は
// App Router のファイル規約（app/ 直下）でヘッダに自動注入される。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "rigel — 麻雀牌譜",
    short_name: "rigel",
    description: "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する",
    lang: "ja",
    start_url: "/",
    display: "standalone",
    background_color: "#0f1115",
    theme_color: "#0b6249",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
