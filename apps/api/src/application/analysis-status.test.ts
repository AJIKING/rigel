// 半荘の解析状態の導出（plan 8-3）。一覧・半荘詳細の DTO に載せる。
// 各半荘の「最新ジョブ」だけを見る: processing → "processing"（ただし 30 分超は
// 宙に浮いた行とみなし "failed" 扱い）/ failed → "failed" / done → null（通常表示）。

import { describe, expect, it } from "vitest";
import type { AnalysisJob } from "../domain/analysis/analysis-job";
import { deriveAnalysisStatus, STALE_ANALYSIS_MS } from "./analysis-status";

const NOW = new Date("2026-08-02T12:00:00.000Z");

function job(partial: Partial<AnalysisJob> & { gameId: string; createdAt: Date }): AnalysisJob {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "u1",
    status: "processing",
    logId: null,
    reason: null,
    updatedAt: partial.createdAt,
    ...partial,
  };
}

describe("deriveAnalysisStatus", () => {
  it("最新ジョブが processing なら processing、failed なら failed、done なら null", () => {
    const jobs = [
      job({ gameId: "g1", status: "processing", createdAt: new Date(NOW.getTime() - 60_000) }),
      job({ gameId: "g2", status: "failed", createdAt: new Date(NOW.getTime() - 60_000) }),
      job({ gameId: "g3", status: "done", createdAt: new Date(NOW.getTime() - 60_000) }),
    ];
    const map = deriveAnalysisStatus(jobs, NOW);

    expect(map.get("g1")).toBe("processing");
    expect(map.get("g2")).toBe("failed");
    expect(map.has("g3")).toBe(false);
  });

  it("同じ半荘は最新ジョブが勝つ（失敗→再解析成功なら表示なし）", () => {
    const jobs = [
      job({ gameId: "g1", status: "done", createdAt: new Date(NOW.getTime() - 60_000) }),
      job({ gameId: "g1", status: "failed", createdAt: new Date(NOW.getTime() - 120_000) }),
    ];
    expect(deriveAnalysisStatus(jobs, NOW).has("g1")).toBe(false);
  });

  it("processing でも 30 分を超えたら failed 扱い（宙に浮いた行を永遠に解析中に見せない）", () => {
    const jobs = [
      job({
        gameId: "g1",
        status: "processing",
        createdAt: new Date(NOW.getTime() - STALE_ANALYSIS_MS - 1),
      }),
    ];
    expect(deriveAnalysisStatus(jobs, NOW).get("g1")).toBe("failed");
  });

  it("gameId の無い旧ジョブは無視する", () => {
    const jobs = [
      job({ gameId: "g1", status: "processing", createdAt: NOW }),
      { ...job({ gameId: "g1", createdAt: NOW }), gameId: null },
    ];
    expect(deriveAnalysisStatus(jobs, NOW).size).toBe(1);
  });
});
