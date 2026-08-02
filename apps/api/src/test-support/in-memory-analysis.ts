// test-support — 非同期解析（ジョブ・一時画像・キュー）の in-memory フェイク。
// StartAnalysisJob / RunAnalysisJob / ルート契約のテストで共用する。

import type { AnalysisJob, AnalysisJobRepository } from "../domain/analysis/analysis-job";
import type {
  AnalysisImageStore,
  AnalysisJobMessage,
  AnalysisQueue,
} from "../domain/analysis/analysis-transport";
import type { ImageRef } from "../domain/kifu/analyzer";

export class InMemoryAnalysisJobRepository implements AnalysisJobRepository {
  jobs = new Map<string, AnalysisJob>();

  create(params: { id: string; userId: string; gameId?: string; now: Date }): Promise<void> {
    this.jobs.set(params.id, {
      id: params.id,
      userId: params.userId,
      status: "processing",
      gameId: params.gameId ?? null,
      logId: null,
      reason: null,
      createdAt: params.now,
      updatedAt: params.now,
    });
    return Promise.resolve();
  }

  findForUser(id: string, userId: string): Promise<AnalysisJob | null> {
    const job = this.jobs.get(id);
    return Promise.resolve(job && job.userId === userId ? job : null);
  }

  listByUser(userId: string): Promise<AnalysisJob[]> {
    return Promise.resolve(
      [...this.jobs.values()]
        .filter((j) => j.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  markDone(id: string, params: { gameId: string; logId: string; now: Date }): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, {
        ...job,
        status: "done",
        gameId: params.gameId,
        logId: params.logId,
        updatedAt: params.now,
      });
    }
    return Promise.resolve();
  }

  markFailed(id: string, params: { reason: string; now: Date }): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, {
        ...job,
        status: "failed",
        reason: params.reason,
        updatedAt: params.now,
      });
    }
    return Promise.resolve();
  }
}

export class InMemoryAnalysisImageStore implements AnalysisImageStore {
  private images = new Map<string, ImageRef>();

  get size(): number {
    return this.images.size;
  }

  put(key: string, image: ImageRef): Promise<void> {
    this.images.set(key, image);
    return Promise.resolve();
  }

  get(key: string): Promise<ImageRef | null> {
    return Promise.resolve(this.images.get(key) ?? null);
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.images.keys()]) {
      if (key.startsWith(prefix)) this.images.delete(key);
    }
    return Promise.resolve();
  }
}

export class InMemoryAnalysisQueue implements AnalysisQueue {
  sent: AnalysisJobMessage[] = [];
  constructor(private readonly fails = false) {}

  send(message: AnalysisJobMessage): Promise<void> {
    if (this.fails) return Promise.reject(new Error("queue send failed"));
    this.sent.push(message);
    return Promise.resolve();
  }
}
