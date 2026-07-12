// test-support — 実 SQLite（sql.js = WASM）上の Db を作る。
// D1 の実装（Drizzle リポジトリ／ストア）を「本物のクエリで」検証するために使う。
// テーブル定義は migrations/*.sql をそのまま適用する（DDL の真実源を二重化しない）。

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import type { Db } from "../infrastructure/db/client";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

const SQL = await initSqlJs();

/**
 * migrations を適用済みの in-memory DB。
 * D1 専用の `batch`（1トランザクションで複数文）は sql.js に無いため、
 * 逐次実行のシムを足す（原子性は D1 の責務なのでテストでは検証しない）。
 */
export function makeTestDb(): Db {
  const sqlite = new SQL.Database();
  for (const file of readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const s = stmt.trim();
      if (s) sqlite.run(s);
    }
  }
  const db = drizzle(sqlite) as unknown as Record<string, unknown>;
  db.batch = async (queries: readonly PromiseLike<unknown>[]) => {
    const out: unknown[] = [];
    for (const q of queries) out.push(await q);
    return out;
  };
  return db as unknown as Db;
}
