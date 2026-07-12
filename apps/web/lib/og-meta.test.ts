import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  buildGameMetadata,
  ogCard,
  type PublicGameSummary,
} from "./og-meta";

const detail: PublicGameSummary = {
  game: { id: "g1", title: "金曜ナイト半荘", createdAt: "2026-07-05T12:34:56.000Z" },
  owner: { id: "user-abcdef012345", handle: "ajiki", displayName: "あじき" },
  logs: [{}, {}, {}],
};

describe("buildGameMetadata", () => {
  it("公開半荘からタイトル・説明・OGP/Twitterカードを組み立てる", () => {
    const meta = buildGameMetadata(detail);
    expect(meta.title).toBe("金曜ナイト半荘");
    expect(meta.description).toContain("@ajiki");
    expect(meta.description).toContain("全3局");
    expect(meta.description).toContain("2026/07/05");
    expect(meta.openGraph?.title).toBe("金曜ナイト半荘");
    expect(meta.openGraph?.siteName).toBe("Rigel");
    expect(meta.openGraph?.url).toBe("/k/g1");
    expect(meta.twitter?.card).toBe("summary_large_image");
  });

  it("無題の半荘はビューアと同じ「（無題の半荘）」で表示する", () => {
    const meta = buildGameMetadata({ ...detail, game: { ...detail.game, title: "" } });
    expect(meta.title).toBe("（無題の半荘）");
  });

  it("handle が無い作者は id 先頭6文字で表す（ビューアと同じ規則）", () => {
    const meta = buildGameMetadata({ ...detail, owner: { ...detail.owner, handle: null } });
    expect(meta.description).toContain("@user-a");
  });

  it("非公開・不存在（null）ではサイト既定にフォールバックし半荘情報を一切含めない", () => {
    const meta = buildGameMetadata(null);
    expect(DEFAULT_TITLE).toBe("麻雀牌譜");
    expect(meta.title).toBe(DEFAULT_TITLE);
    expect(meta.description).toBe(DEFAULT_DESCRIPTION);
    expect(meta.openGraph?.url).toBeUndefined();
  });
});

describe("ogCard", () => {
  it("OG画像カードの文言（タイトル・作者・局数/日付）を組み立てる", () => {
    expect(ogCard(detail)).toEqual({
      title: "金曜ナイト半荘",
      author: "@ajiki",
      info: "全3局・2026/07/05",
    });
  });

  it("非公開・不存在（null）は汎用カード（半荘情報を含まない定型文言のみ）", () => {
    expect(ogCard(null)).toEqual({
      title: "麻雀牌譜",
      author: null,
      info: "麻雀の牌譜をブラウザで再生",
    });
  });
});
