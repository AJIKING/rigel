import { describe, expect, it } from "vitest";
import { buildSitemap } from "./seo";

const base = "https://raisha.jp";

describe("buildSitemap", () => {
  it("静的な公開ページ（/ /kifu /problems /terms）を常に含む", () => {
    const urls = buildSitemap(base, { games: [], problems: [] }).map((e) => e.url);
    expect(urls).toContain(`${base}/`);
    expect(urls).toContain(`${base}/kifu`);
    expect(urls).toContain(`${base}/problems`);
    expect(urls).toContain(`${base}/terms`);
  });

  it("公開半荘は /k/[gameId]、公開何切るは /p/[id] を絶対URLで載せ、lastModified に作成日時を使う", () => {
    const entries = buildSitemap(base, {
      games: [{ id: "g1", createdAt: "2026-07-05T12:34:56.000Z" }],
      problems: [{ id: "p1", createdAt: "2026-07-06T00:00:00.000Z" }],
    });
    const game = entries.find((e) => e.url === `${base}/k/g1`);
    const problem = entries.find((e) => e.url === `${base}/p/p1`);
    expect(game?.lastModified).toBe("2026-07-05T12:34:56.000Z");
    expect(problem?.lastModified).toBe("2026-07-06T00:00:00.000Z");
  });

  it("非公開ページ（/mypage /settings /login など）を含まない", () => {
    const urls = buildSitemap(base, { games: [], problems: [] }).map((e) => e.url);
    expect(urls.some((u) => /\/(mypage|settings|login|dev)\b/.test(u))).toBe(false);
  });
});
