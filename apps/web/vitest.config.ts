import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ は Playwright（実ブラウザ）専用。vitest では実行しない。
    // .open-next/ はデプロイ用ビルド成果物（同梱 node_modules のテストを拾わない）。
    exclude: ["e2e/**", "node_modules/**", ".next/**", ".open-next/**"],
  },
});
