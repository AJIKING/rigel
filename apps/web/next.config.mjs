import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ワークスペースの TS パッケージ（背骨スキーマ・UI）をそのままトランスパイルする
  transpilePackages: ["@rigel/schema", "@rigel/ui"],
  eslint: {
    // Lint はモノレポ共通の eslint.config.mjs（ルート）で実施するので、build 中は走らせない
    ignoreDuringBuilds: true,
  },
  // セキュリティヘッダ。課金操作を含む /settings が frame 化されうる（クリックジャッキング）
  // ため frame-ancestors を塞ぎ、Referer からの情報漏れと MIME スニッフィングも止める。
  // CSP のスクリプト制限は Next の inline スクリプト（nonce 運用）が要るため今は入れない。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

// `next dev` で Cloudflare バインディング（getCloudflareContext）を使えるようにする。
// dev 以外では no-op。本番ビルド（next build / opennextjs-cloudflare build）には影響しない。
initOpenNextCloudflareForDev();

export default nextConfig;
