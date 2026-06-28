import { defineConfig } from "drizzle-kit";

// Drizzle Kit 設定（D1 = SQLite 方言）。
// `pnpm --filter api db:generate` で migrations/ に SQL を生成し、
// `pnpm --filter api db:migrate:local|db:migrate` で wrangler が D1 に適用する。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/infrastructure/db/schema.ts",
  out: "./migrations",
});
