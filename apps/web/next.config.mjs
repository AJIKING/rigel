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

export default nextConfig;
