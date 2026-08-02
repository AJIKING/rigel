import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // "server-only" は Next 専用。クライアント component から Server Action を呼ぶと
      // import グラフが lib/api-server.ts まで伸びて解決に失敗するため、テストでは空にする
      // （詳細は vitest.server-only-stub.ts のコメント）。
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ と shots/ は Playwright（実ブラウザ）専用。vitest では実行しない。
    // .open-next/ はデプロイ用ビルド成果物（同梱 node_modules のテストを拾わない）。
    exclude: ["e2e/**", "shots/**", "node_modules/**", ".next/**", ".open-next/**"],
  },
});
