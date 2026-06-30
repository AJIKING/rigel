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
};

// `next dev` で Cloudflare バインディング（getCloudflareContext）を使えるようにする。
// dev 以外では no-op。本番ビルド（next build / opennextjs-cloudflare build）には影響しない。
initOpenNextCloudflareForDev();

export default nextConfig;
