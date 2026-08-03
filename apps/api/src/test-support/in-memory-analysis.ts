// test-support — 非同期解析（ジョブ・一時画像・キュー）の in-memory フェイク。
// StartAnalysisJob / RunAnalysisJob / ルート契約のテストで共用する。

import type { AnalysisJob, AnalysisJobRepository } from "../domain/analysis/analysis-job";
import type {
  AnalysisImageStore,
  AnalysisJobMessage,
  AnalysisQueue,
} from "../domain/analysis/analysis-transport";
import type { ImageRef } from "../domain/kifu/analyzer";
import type {
  ProblemDraft,
  ProblemDraftRepository,
} from "../domain/problem/problem-draft.repository";

export class InMemoryAnalysisJobRepository implements AnalysisJobRepository {
  jobs = new Map<string, AnalysisJob>();

  create(params: { id: string; userId: string; gameId?: string | null; now: Date }): Promise<void> {
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

  listActiveByUser(userId: string): Promise<AnalysisJob[]> {
    return Promise.resolve(
      [...this.jobs.values()]
        .filter((j) => j.userId === userId && j.status !== "done")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  deleteByGame(gameId: string): Promise<void> {
    for (const [id, job] of [...this.jobs]) {
      if (job.gameId === gameId) this.jobs.delete(id);
    }
    return Promise.resolve();
  }

  deleteById(id: string): Promise<void> {
    this.jobs.delete(id);
    return Promise.resolve();
  }

  markDone(
    id: string,
    params: { gameId: string | null; logId: string | null; now: Date },
  ): Promise<void> {
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

  markProcessing(id: string, params: { now: Date }): Promise<void> {
    const job = this.jobs.get(id);
    if (job) {
      this.jobs.set(id, { ...job, status: "processing", reason: null, updatedAt: params.now });
    }
    return Promise.resolve();
  }
}

export class InMemoryAnalysisImageStore implements AnalysisImageStore {
  private images = new Map<string, ImageRef>();
  /** JSON 置き場（何切るジョブの result.json）。画像とキー空間を共有する。 */
  private jsons = new Map<string, unknown>();

  get size(): number {
    return this.images.size + this.jsons.size;
  }

  put(key: string, image: ImageRef): Promise<void> {
    this.images.set(key, image);
    return Promise.resolve();
  }

  get(key: string): Promise<ImageRef | null> {
    return Promise.resolve(this.images.get(key) ?? null);
  }

  delete(key: string): Promise<void> {
    this.images.delete(key);
    this.jsons.delete(key);
    return Promise.resolve();
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.images.keys()]) {
      if (key.startsWith(prefix)) this.images.delete(key);
    }
    for (const key of [...this.jsons.keys()]) {
      if (key.startsWith(prefix)) this.jsons.delete(key);
    }
    return Promise.resolve();
  }

  listKeys(prefix: string): Promise<string[]> {
    return Promise.resolve(
      [...this.images.keys(), ...this.jsons.keys()].filter((k) => k.startsWith(prefix)).sort(),
    );
  }

  putJson(key: string, value: unknown): Promise<void> {
    // 実装（R2）と同じく JSON 経由で往復させる（Date 等が素通りしない）。
    this.jsons.set(key, JSON.parse(JSON.stringify(value)));
    return Promise.resolve();
  }

  getJson(key: string): Promise<unknown | null> {
    return Promise.resolve(this.jsons.get(key) ?? null);
  }
}

export class InMemoryProblemDraftRepository implements ProblemDraftRepository {
  drafts = new Map<string, ProblemDraft>();

  create(params: { id: string; userId: string; jobId: string; now: Date }): Promise<void> {
    this.drafts.set(params.id, {
      id: params.id,
      userId: params.userId,
      jobId: params.jobId,
      kifu: null,
      createdAt: params.now,
      updatedAt: params.now,
    });
    return Promise.resolve();
  }

  findForUser(id: string, userId: string): Promise<ProblemDraft | null> {
    const d = this.drafts.get(id);
    return Promise.resolve(d && d.userId === userId ? d : null);
  }

  findByJobForUser(jobId: string, userId: string): Promise<ProblemDraft | null> {
    const d = [...this.drafts.values()].find((x) => x.jobId === jobId && x.userId === userId);
    return Promise.resolve(d ?? null);
  }

  listByUser(userId: string): Promise<ProblemDraft[]> {
    return Promise.resolve(
      [...this.drafts.values()]
        .filter((d) => d.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  setKifu(id: string, params: { kifu: ProblemDraft["kifu"]; now: Date }): Promise<void> {
    const d = this.drafts.get(id);
    if (d) this.drafts.set(id, { ...d, kifu: params.kifu, updatedAt: params.now });
    return Promise.resolve();
  }

  delete(id: string): Promise<void> {
    this.drafts.delete(id);
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
