import { KifuSchema, ProblemSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { createApiClient, gamePhotoPath } from "./index";

function fakeFetch(handler: (url: string) => Response): typeof fetch {
  return ((url: string) => Promise.resolve(handler(String(url)))) as unknown as typeof fetch;
}

function fakeFetch2(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return ((url: string, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init))) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("createApiClient", () => {
  it("analyzeProblem は POST /problems/analyze して 202 の jobId を返す（非同期ジョブ）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/problems/analyze");
        expect(init?.method).toBe("POST");
        return json({ ok: true, jobId: "job-9" }, 202);
      }),
    );
    const result = await client.analyzeProblem("tok", new FormData());
    expect(result).toEqual({ ok: true, jobId: "job-9" });
  });

  it("getProblemAnalysisJob は done のジョブから結果ドラフト（Kifu 形）を受け取る", async () => {
    const kifu = KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-07-14T00:00:00.000Z",
      seats: { east: {}, south: {}, west: {}, north: {} },
    });
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems/analyze/jobs/job-9");
        return json({
          id: "job-9",
          status: "done",
          reason: null,
          createdAt: "2026-08-02T10:00:00.000Z",
          updatedAt: "2026-08-02T10:01:00.000Z",
          draft: kifu,
        });
      }),
    );
    const job = await client.getProblemAnalysisJob("tok", "job-9");
    expect(job?.status).toBe("done");
    expect(job?.draft?.schemaVersion).toBe("1.0.0");
  });

  it("retryAnalysis は POST /analyze/jobs/:id/retry して 202 の jobId/gameId を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/analyze/jobs/job-9/retry");
        expect(init?.method).toBe("POST");
        return json({ ok: true, jobId: "job-9", gameId: "g1" }, 202);
      }),
    );
    expect(await client.retryAnalysis("tok", "job-9")).toEqual({
      ok: true,
      jobId: "job-9",
      gameId: "g1",
    });
  });

  it("retryAnalysis の期限切れは status と reason を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "retry_expired" }, 400)),
    );
    expect(await client.retryAnalysis("tok", "job-9")).toEqual({
      ok: false,
      status: 400,
      reason: "retry_expired",
    });
  });

  it("listGamePhotos は所有者の元写真メタを返し、gamePhotoPath がバイト配信パスを組む", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/games/g1/photos");
        return json({ photos: [{ jobId: "j1", kind: "river" }] });
      }),
    );
    const photos = await client.listGamePhotos("tok", "g1");
    expect(photos).toEqual([{ jobId: "j1", kind: "river" }]);
    expect(gamePhotoPath("g1", photos![0]!)).toBe("/games/g1/photos/j1/river");
  });

  it("getProblemAnalysisJob の 404（消えたジョブ）は null", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ error: "not found" }, 404)),
    );
    expect(await client.getProblemAnalysisJob("tok", "gone")).toBeNull();
  });

  it("analyzeProblem の失敗は status と reason を返す（枠切れ 403 など）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "quota_exceeded" }, 403)),
    );
    const result = await client.analyzeProblem("tok", new FormData());
    expect(result).toEqual({ ok: false, status: 403, reason: "quota_exceeded" });
  });

  it("getMyGames は件数つきカードの1ページを返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/me/games");
        return json({
          items: [
            {
              id: "g1",
              title: "卓1",
              createdAt: "2026-06-28",
              kyokuCount: 8,
              publicCount: 2,
              draftCount: 1,
            },
          ],
          nextCursor: "999_g1",
        });
      }),
    );
    const page = await client.getMyGames("tok");
    expect(page.items[0]?.kyokuCount).toBe(8);
    expect(page.items[0]?.draftCount).toBe(1);
    expect(page.nextCursor).toBe("999_g1");
  });

  it("getPublicGames は認証なしで公開カードを返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/games/public");
        // カーソル方式のページ形 {items, nextCursor}。
        return json({
          items: [
            {
              id: "g1",
              ownerId: "u9",
              ownerHandle: "kuro",
              ownerName: "くろ",
              title: "公開卓",
              createdAt: "2026-06-28",
              kyokuCount: 5,
            },
          ],
          nextCursor: "1000_g1",
        });
      }),
    );
    const page = await client.getPublicGames();
    expect(page.items[0]?.ownerId).toBe("u9");
    expect(page.items[0]?.ownerHandle).toBe("kuro");
    expect(page.nextCursor).toBe("1000_g1");
  });

  it("getGame は 404 で null", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await client.getGame("tok", "missing")).toBeNull();
  });

  it("fetchMe は非200で null", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("no", { status: 401 })),
    );
    expect(await client.fetchMe("bad")).toBeNull();
  });

  it("authWithGoogle は失敗時に例外", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("err", { status: 500 })),
    );
    await expect(client.authWithGoogle("idtok")).rejects.toThrow(/500/);
  });

  it("authWithApple は idToken と authorizationCode を /auth/apple に送る", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/auth/apple");
        expect(JSON.parse(String(init?.body))).toEqual({
          idToken: "idtok",
          authorizationCode: "code-1",
        });
        return json({ sessionToken: "s1", created: true, user: { id: "u1" } });
      }),
    );
    const result = await client.authWithApple("idtok", "code-1");
    expect(result.sessionToken).toBe("s1");
  });

  it("authWithApple は失敗時に例外", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("err", { status: 401 })),
    );
    await expect(client.authWithApple("idtok")).rejects.toThrow(/401/);
  });

  it("authWithReviewCode は code を /auth/review に送る", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/auth/review");
        expect(JSON.parse(String(init?.body))).toEqual({ code: "sesame" });
        return json({ sessionToken: "s1", created: true, user: { id: "u1" } });
      }),
    );
    const result = await client.authWithReviewCode("sesame");
    expect(result.sessionToken).toBe("s1");
  });

  it("authWithReviewCode は失敗時に例外", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("err", { status: 401 })),
    );
    await expect(client.authWithReviewCode("wrong")).rejects.toThrow(/401/);
  });

  it("analyze は 202 で jobId を返す（非同期ジョブ。docs/plans/async-analysis.md）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/analyze");
        return json({ ok: true, jobId: "job-1" }, 202);
      }),
    );
    const result = await client.analyze("tok", new FormData());
    expect(result).toEqual({ ok: true, jobId: "job-1" });
  });

  it("analyze は枠超過(402)を理由付きで返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "quota_exceeded" }, 402)),
    );
    const result = await client.analyze("tok", new FormData());
    expect(result).toEqual({ ok: false, status: 402, reason: "quota_exceeded" });
  });

  it("getAnalysisJob は GET /analyze/jobs/:id でジョブ状態を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/analyze/jobs/job-1");
        return json({
          id: "job-1",
          status: "done",
          gameId: "g1",
          logId: "l1",
          reason: null,
          createdAt: "2026-08-01T09:00:00.000Z",
          updatedAt: "2026-08-01T09:03:00.000Z",
        });
      }),
    );
    const job = await client.getAnalysisJob("tok", "job-1");
    expect(job).toMatchObject({ id: "job-1", status: "done", gameId: "g1", logId: "l1" });
  });

  it("getAnalysisJob は 404 で null（消えたジョブはクライアント側で失敗扱いにできる）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await client.getAnalysisJob("tok", "missing")).toBeNull();
  });

  it("updateKifu は PUT /kifu/:id して成否を返す", async () => {
    let method = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      expect(String(url)).toBe("https://api.test/kifu/l1");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const minimalKifu = KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-06-28T00:00:00.000Z",
      seats: { east: {}, south: {}, west: {}, north: {} },
    });
    const result = await client.updateKifu("tok", "l1", minimalKifu);
    expect(method).toBe("PUT");
    expect(result.ok).toBe(true);
  });

  it("createCheckout は plan を送って決済URLを返す", async () => {
    let body = "";
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/billing/checkout");
        body = String(init?.body ?? "");
        return json({ url: "https://stripe.test/pay/abc" });
      }),
    );
    const result = await client.createCheckout("tok", {
      plan: "pro",
      successUrl: "https://app/ok",
      cancelUrl: "https://app/ng",
    });
    expect(result).toEqual({ ok: true, url: "https://stripe.test/pay/abc" });
    expect(body).toContain('"pro"');
  });

  it("createPortal は returnUrl を送って決済ポータルURLを返す（未加入404は ok:false）", async () => {
    const ok = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/billing/portal");
        expect(String(init?.body ?? "")).toContain("https://app/settings");
        return json({ url: "https://stripe.test/portal/abc" });
      }),
    );
    expect(await ok.createPortal("tok", { returnUrl: "https://app/settings" })).toEqual({
      ok: true,
      url: "https://stripe.test/portal/abc",
    });

    const nf = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await nf.createPortal("tok", { returnUrl: "https://app/settings" })).toEqual({
      ok: false,
      status: 404,
    });
  });

  it("createCheckout は課金未設定(501)で ok:false", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("no", { status: 501 })),
    );
    const result = await client.createCheckout("tok", {
      plan: "next",
      successUrl: "a",
      cancelUrl: "b",
    });
    expect(result).toEqual({ ok: false, status: 501 });
  });

  it("deleteKifu は DELETE /kifu/:id して成否を返す", async () => {
    let method = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      expect(String(url)).toBe("https://api.test/kifu/l1");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const result = await client.deleteKifu("tok", "l1");
    expect(method).toBe("DELETE");
    expect(result.ok).toBe(true);
  });

  it("deleteGame は DELETE /games/:id して成否を返す", async () => {
    let method = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      expect(String(url)).toBe("https://api.test/games/g1");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const result = await client.deleteGame("tok", "g1");
    expect(method).toBe("DELETE");
    expect(result.ok).toBe(true);
  });

  it("setGameVisibility は PATCH /games/:id/visibility して成否を返す", async () => {
    let body = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      body = String(init?.body ?? "");
      expect(String(url)).toBe("https://api.test/games/g1/visibility");
      expect(init?.method).toBe("PATCH");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const result = await client.setGameVisibility("tok", "g1", "public");
    expect(JSON.parse(body)).toEqual({ visibility: "public" });
    expect(result.ok).toBe(true);
  });

  it("updateGame は PATCH /games/:id して成否を返す", async () => {
    let method = "";
    let body = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      body = String(init?.body ?? "");
      expect(String(url)).toBe("https://api.test/games/g1");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const result = await client.updateGame("tok", "g1", { title: "新名称" });
    expect(method).toBe("PATCH");
    expect(JSON.parse(body)).toEqual({ title: "新名称" });
    expect(result.ok).toBe(true);
  });

  it("createEmptyKifu は POST /games/:id/kifu して logId を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/games/g1/kifu");
        return json({ ok: true, logId: "new-log" }, 201);
      }),
    );
    const result = await client.createEmptyKifu("tok", "g1", "east");
    expect(result).toEqual({ ok: true, logId: "new-log" });
  });

  it("updateProfile は PUT /me/profile して成否を返す（409=重複）", async () => {
    let method = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      expect(String(url)).toBe("https://api.test/me/profile");
      return Promise.resolve(new Response("conflict", { status: 409 }));
    }) as unknown as typeof fetch);
    const result = await client.updateProfile("tok", { handle: "rin" });
    expect(method).toBe("PUT");
    expect(result).toEqual({ ok: false, status: 409 });
  });

  it("getPublicProfile は handle で公開プロフィールを返す（404=null）", async () => {
    const ok = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/users/kuro_2p/profile");
        return json({ id: "u1", handle: "kuro_2p", displayName: "kuro", games: [] });
      }),
    );
    expect((await ok.getPublicProfile("kuro_2p"))?.handle).toBe("kuro_2p");

    const nf = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await nf.getPublicProfile("missing")).toBeNull();
  });

  it("deleteAccount は DELETE /me する", async () => {
    let method = "";
    const client = createApiClient("https://api.test", ((url: string, init?: RequestInit) => {
      method = init?.method ?? "GET";
      expect(String(url)).toBe("https://api.test/me");
      return Promise.resolve(json({ ok: true }));
    }) as unknown as typeof fetch);
    const result = await client.deleteAccount("tok");
    expect(method).toBe("DELETE");
    expect(result.ok).toBe(true);
  });
});

describe("problems（何切る問題）", () => {
  const problemData = ProblemSchema.parse({
    schemaVersion: "1.0.0",
    kind: "discard",
    pov: "east",
    drawn: "5p",
    seats: {
      east: {
        hand: ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"].map(
          (t) => ({ tile: t }),
        ),
      },
      south: {},
      west: {},
      north: {},
    },
  });

  const post = {
    id: "p1",
    userId: "u1",
    title: "t",
    problem: problemData,
    status: "published",
    createdAt: "2026-07-07T00:00:00.000Z",
  };

  it("getPublicProblems は認証なしで公開一覧の1ページを返す（カーソル方式）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems");
        return json({ items: [post], nextCursor: "1000_p1" });
      }),
    );
    const page = await client.getPublicProblems();
    expect(page.items[0]?.id).toBe("p1");
    expect(page.nextCursor).toBe("1000_p1");
  });

  it("getPublicProblems は cursor をクエリで渡す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems?cursor=1000_p1");
        return json({ items: [], nextCursor: null });
      }),
    );
    expect((await client.getPublicProblems("1000_p1")).nextCursor).toBeNull();
  });

  it("getMyProblems は自分の一覧（draft 含む）の1ページを返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems/mine");
        return json({ items: [{ ...post, status: "draft" }], nextCursor: null });
      }),
    );
    expect((await client.getMyProblems("tok")).items[0]?.status).toBe("draft");
  });

  it("getProblem は 404 で null・トークンは任意", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await client.getProblem("missing")).toBeNull();
  });

  it("createProblem は 201 で problemId・403 は status 付き ok:false", async () => {
    const ok = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/problems");
        expect(init?.method).toBe("POST");
        return json({ ok: true, problemId: "p1" }, 201);
      }),
    );
    expect(await ok.createProblem("tok", { title: "t", problem: problemData })).toEqual({
      ok: true,
      problemId: "p1",
    });

    const limited = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "problem_limit" }, 403)),
    );
    expect(await limited.createProblem("tok", { title: "t", problem: problemData })).toEqual({
      ok: false,
      status: 403,
    });
  });

  it("updateProblem / deleteProblem は成否と status を返す", async () => {
    let method = "";
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/problems/p1");
        method = init?.method ?? "";
        return json({ ok: true });
      }),
    );
    expect(await client.updateProblem("tok", "p1", { status: "published" })).toEqual({
      ok: true,
      status: 200,
    });
    expect(method).toBe("PUT");
    expect(await client.deleteProblem("tok", "p1")).toEqual({ ok: true, status: 200 });
    expect(method).toBe("DELETE");
  });

  it("answerProblem は回答を POST し成否を返す（レスポンスはシンプル）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/problems/p1/answers");
        expect(JSON.parse(String(init?.body)).action).toEqual({
          type: "discard",
          tile: "5p",
          riichi: true,
          tsumogiri: false,
        });
        return json({ ok: true });
      }),
    );
    expect(
      await client.answerProblem("tok", "p1", {
        type: "discard",
        tile: "5p",
        riichi: true,
        tsumogiri: false,
      }),
    ).toEqual({ ok: true, status: 200 });
  });

  it("getProblemStats は分布を返し、404 は null", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems/p1/stats");
        return json({
          counts: { "discard:5p": 2 },
          total: 2,
          myChoiceKey: "discard:5p",
          myAction: { type: "discard", tile: "5p", riichi: false },
        });
      }),
    );
    expect((await client.getProblemStats("tok", "p1"))?.total).toBe(2);

    const nf = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(await nf.getProblemStats("tok", "p1")).toBeNull();
  });

  it("startQuizSession は POST /quiz/sessions に kind を送り id と remainingToday を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/quiz/sessions");
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ kind: "chinitsu" });
        return json({ ok: true, id: "q1", remainingToday: 2 }, 201);
      }),
    );
    expect(await client.startQuizSession("tok", "chinitsu")).toEqual({
      ok: true,
      id: "q1",
      remainingToday: 2,
    });
  });

  it("startQuizSession は無料枠超過(402)を理由付きで返す（analyze 系と同じ流儀）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "quota_exceeded" }, 402)),
    );
    expect(await client.startQuizSession("tok", "chinitsu")).toEqual({
      ok: false,
      status: 402,
      reason: "quota_exceeded",
    });
  });

  it("finishQuizSession は PATCH /quiz/sessions/:id に結果を送り成否を返す", async () => {
    const result = { kind: "chinitsu", total: 10, correct: 7, durationMs: 61_000 } as const;
    const client = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/quiz/sessions/q1");
        expect(init?.method).toBe("PATCH");
        expect(JSON.parse(String(init?.body))).toEqual(result);
        return json({ ok: true });
      }),
    );
    expect(await client.finishQuizSession("tok", "q1", result)).toEqual({ ok: true, status: 200 });
  });

  it("finishQuizSession は他人の行(404)を成否で返す（例外にしない）", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("nf", { status: 404 })),
    );
    expect(
      await client.finishQuizSession("tok", "q1", {
        kind: "chinitsu",
        total: 1,
        correct: 0,
        durationMs: 60_000,
      }),
    ).toEqual({ ok: false, status: 404 });
  });

  it("listQuizSessions は自分の完了済み履歴を返す（since は ?since= に載せる）", async () => {
    const row = {
      id: "q1",
      kind: "chinitsu",
      total: 10,
      correct: 7,
      durationMs: 61_000,
      createdAt: "2026-07-24T03:00:00.000Z",
    };
    const noSince = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/quiz/sessions");
        return json([row]);
      }),
    );
    expect(await noSince.listQuizSessions("tok")).toEqual([row]);

    const withSince = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/quiz/sessions?since=2026-07-01T00%3A00%3A00.000Z");
        return json([]);
      }),
    );
    expect(await withSince.listQuizSessions("tok", "2026-07-01T00:00:00.000Z")).toEqual([]);
  });

  it("listQuizSessions は失敗時に例外", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => new Response("err", { status: 500 })),
    );
    await expect(client.listQuizSessions("tok")).rejects.toThrow(/500/);
  });
});
