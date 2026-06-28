// infrastructure/db — Drizzle クライアント（D1 バインディングから生成）。

import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof createDb>;
