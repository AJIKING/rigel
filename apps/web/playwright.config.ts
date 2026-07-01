import { defineConfig, devices } from "@playwright/test";

// 盤面レイアウトの実ブラウザ検証。jsdom はレイアウトを持たないため、
// 牌の重なりは Chromium で実際に矩形を測って確認する。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    viewport: { width: 1440, height: 1024 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // dev サーバで検証（本番には fixture ルートを出さないため）。
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100/dev/board",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
