import { KifuSchema, ProblemSchema } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

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
  it("getGames は一覧を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/games");
        return json([{ id: "g1", userId: "u1", title: "", createdAt: "2026-06-28T00:00:00.000Z" }]);
      }),
    );
    const games = await client.getGames("tok");
    expect(games).toHaveLength(1);
    expect(games[0]?.id).toBe("g1");
  });

  it("getMyGames は件数つきカードを返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/me/games");
        return json([
          {
            id: "g1",
            title: "卓1",
            createdAt: "2026-06-28",
            kyokuCount: 8,
            publicCount: 2,
            draftCount: 1,
          },
        ]);
      }),
    );
    const cards = await client.getMyGames("tok");
    expect(cards[0]?.kyokuCount).toBe(8);
    expect(cards[0]?.draftCount).toBe(1);
  });

  it("getPublicGames は認証なしで公開カードを返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/games/public");
        return json([
          {
            id: "g1",
            ownerId: "u9",
            ownerHandle: "kuro",
            ownerName: "くろ",
            title: "公開卓",
            createdAt: "2026-06-28",
            kyokuCount: 5,
          },
        ]);
      }),
    );
    const cards = await client.getPublicGames();
    expect(cards[0]?.ownerId).toBe("u9");
    expect(cards[0]?.ownerHandle).toBe("kuro");
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

  it("analyze は 201 で gameId/logId を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/analyze");
        return json({ ok: true, gameId: "g1", logId: "l1" }, 201);
      }),
    );
    const result = await client.analyze("tok", new FormData());
    expect(result).toEqual({ ok: true, gameId: "g1", logId: "l1" });
  });

  it("analyze は枠超過(402)を理由付きで返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "quota_exceeded" }, 402)),
    );
    const result = await client.analyze("tok", new FormData());
    expect(result).toEqual({ ok: false, status: 402, reason: "quota_exceeded" });
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

  it("redeemAppStorePurchase は JWS を送ってプランを返す（失敗は status+reason）", async () => {
    const ok = createApiClient(
      "https://api.test",
      fakeFetch2((url, init) => {
        expect(url).toBe("https://api.test/billing/appstore/redeem");
        expect(String(init?.body ?? "")).toContain("signed-jws");
        return json({ ok: true, plan: "pro" });
      }),
    );
    expect(await ok.redeemAppStorePurchase("tok", { jws: "signed-jws" })).toEqual({
      ok: true,
      plan: "pro",
    });

    const ng = createApiClient(
      "https://api.test",
      fakeFetch(() => json({ ok: false, reason: "invalid_transaction" }, 400)),
    );
    expect(await ng.redeemAppStorePurchase("tok", { jws: "bad" })).toEqual({
      ok: false,
      status: 400,
      reason: "invalid_transaction",
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
          (t) => ({ tile: t, confidence: 1 }),
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

  it("getPublicProblems は認証なしで公開一覧を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems");
        return json([post]);
      }),
    );
    expect((await client.getPublicProblems())[0]?.id).toBe("p1");
  });

  it("getMyProblems は自分の一覧（draft 含む）を返す", async () => {
    const client = createApiClient(
      "https://api.test",
      fakeFetch((url) => {
        expect(url).toBe("https://api.test/problems/mine");
        return json([{ ...post, status: "draft" }]);
      }),
    );
    expect((await client.getMyProblems("tok"))[0]?.status).toBe("draft");
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
});
