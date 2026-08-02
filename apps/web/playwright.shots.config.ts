import { defineConfig, devices } from "@playwright/test";

// ストア用プロモ画像の撮影（pnpm shots）。/dev/promo のフレームを
// deviceScaleFactor 付きで element screenshot し、docs/store-assets/ へ出力する。
// e2e（レイアウト検証）とはテスト対象が違うため設定を分ける。
export default defineConfig({
  testDir: "./shots",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  timeout: 300_000,
  use: {
    baseURL: "http://localhost:3100",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // dev サーバで撮影（/dev/promo は本番に出さないフィクスチャのため）。
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100/dev/board",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
