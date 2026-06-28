import { describe, expect, it } from "vitest";
import { createApiClient } from "./index";

function fakeFetch(handler: (url: string) => Response): typeof fetch {
  return ((url: string) => Promise.resolve(handler(String(url)))) as unknown as typeof fetch;
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
});
