// RevenueCat Webhook 冪等ゲートの実 Drizzle 検証。
// usecase テストは in-memory フェイクで冪等性を確認しているが、二重課金防止の
// 最後の砦は実クエリ（PRIMARY KEY + onConflictDoNothing）なので、実 SQLite
//（sql.js = WASM。D1 と同じ SQLite 方言・ネイティブビルド不要）で回帰を張る。

import { drizzle } from "drizzle-orm/sql-js";
import initSqlJs from "sql.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { DrizzleRevenueCatEventRepository } from "./drizzle-revenuecat-event.repository";

const SQL = await initSqlJs();

/** migrations/ の revenuecat_events と同じ形のテーブルを持つ in-memory DB を作る。 */
function makeRepo() {
  const sqlite = new SQL.Database();
  sqlite.run("CREATE TABLE revenuecat_events (id text PRIMARY KEY, processed_at integer NOT NULL)");
  // sql-js ドライバは同期だが await 可能で、D1 版と同じクエリビルダを通る。
  // 型は D1 の Db と異なるためテストに限りキャストする。
  return new DrizzleRevenueCatEventRepository(drizzle(sqlite) as unknown as Db);
}

describe("DrizzleRevenueCatEventRepository（Webhook 冪等ゲートの実クエリ）", () => {
  let repo: DrizzleRevenueCatEventRepository;
  beforeEach(() => {
    repo = makeRepo();
  });

  it("未処理の event.id は false、markProcessed 後は true になる", async () => {
    expect(await repo.isProcessed("evt-1")).toBe(false);
    await repo.markProcessed("evt-1");
    expect(await repo.isProcessed("evt-1")).toBe(true);
  });

  it("同一 event.id の再記録は一意制約に落ちず冪等（並行再送とぶつかっても壊れない）", async () => {
    await repo.markProcessed("evt-1");
    await expect(repo.markProcessed("evt-1")).resolves.toBeUndefined(); // onConflictDoNothing
    expect(await repo.isProcessed("evt-1")).toBe(true);
  });

  it("event.id ごとに独立して記録される（別イベントを誤って処理済みにしない）", async () => {
    await repo.markProcessed("evt-1");
    expect(await repo.isProcessed("evt-2")).toBe(false);
    await repo.markProcessed("evt-2");
    expect(await repo.isProcessed("evt-1")).toBe(true);
    expect(await repo.isProcessed("evt-2")).toBe(true);
  });
});
