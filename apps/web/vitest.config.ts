import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ は Playwright（実ブラウザ）専用。vitest では実行しない。
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
