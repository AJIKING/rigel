import { PROBLEM_SCHEMA_VERSION } from "@rigel/schema";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  buildGameMetadata,
  buildProblemMetadata,
  buildProfileMetadata,
  ogCard,
  problemOgCard,
  type ProblemMetaInput,
  type PublicGameSummary,
  type PublicProfileSummary,
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
    expect(meta.alternates?.canonical).toBe("/k/g1");
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
    expect(meta.alternates).toBeUndefined();
  });
});

const problem: ProblemMetaInput = {
  id: "p1",
  title: "南3局の押し引き",
  status: "published",
};

describe("buildProblemMetadata", () => {
  it("公開（published）の問題からタイトル・説明・OGP/Twitterカードを組み立てる", () => {
    const meta = buildProblemMetadata(problem);
    expect(meta.title).toBe("南3局の押し引き");
    expect(meta.description).toContain("何切る");
    expect(meta.openGraph?.title).toBe("南3局の押し引き");
    expect(meta.openGraph?.siteName).toBe("Rigel");
    expect(meta.openGraph?.url).toBe("/p/p1");
    expect(meta.alternates?.canonical).toBe("/p/p1");
    // /p は opengraph-image で手牌カードを動的生成する（/k と同じ流儀）。
    expect(meta.twitter?.card).toBe("summary_large_image");
    expect(meta.robots).toBeUndefined();
  });

  it("無題の問題は画面と同じ「（無題の問題）」で表示する", () => {
    const meta = buildProblemMetadata({ ...problem, title: "" });
    expect(meta.title).toBe("（無題の問題）");
  });

  it("下書き（draft）はタブ用のタイトルだけ持ち、noindex で OGP を付けない（所有者専用ページ）", () => {
    const meta = buildProblemMetadata({ ...problem, status: "draft" });
    expect(meta.title).toBe("南3局の押し引き");
    expect(meta.robots).toEqual({ index: false });
    expect(meta.openGraph).toBeUndefined();
    expect(meta.alternates).toBeUndefined();
  });

  it("不存在（null）ではサイト既定にフォールバックし問題情報を一切含めない", () => {
    const meta = buildProblemMetadata(null);
    expect(meta.title).toBe(DEFAULT_TITLE);
    expect(meta.description).toBe(DEFAULT_DESCRIPTION);
    expect(meta.openGraph).toBeUndefined();
  });
});

describe("problemOgCard", () => {
  // 手牌はわざと理牌前の順で置き、カードでは理牌済みで出ることを確認する。
  const HAND = ["9m", "1m", "5m", "2m", "3m", "4m", "6m", "7m", "8m", "1p", "2p", "3p", "4p"];
  const discardProblem = {
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn: "5s",
    seats: {
      east: { hand: HAND.map((t) => ({ tile: t })) },
      south: {},
      west: {},
      north: {},
    },
    meta: { dealer: "east", roundWind: "west", junme: 9 },
  };

  it("公開の何切るからタイトル・種別/局情報・理牌済み手牌＋ツモ牌を組み立てる", () => {
    const card = problemOgCard({ ...problem, problem: discardProblem });
    expect(card.title).toBe("南3局の押し引き");
    expect(card.info).toBe("何切る・西場 9巡目");
    expect(card.hand).toEqual([
      "1m",
      "2m",
      "3m",
      "4m",
      "5m",
      "6m",
      "7m",
      "8m",
      "9m",
      "1p",
      "2p",
      "3p",
      "4p",
    ]);
    expect(card.drawn).toBe("5s");
  });

  it("鳴き判断はツモ牌なし・種別ラベルは「鳴き判断」", () => {
    const callProblem = {
      ...discardProblem,
      kind: "call",
      drawn: null,
      targetSeat: "south",
      seats: {
        ...discardProblem.seats,
        south: { river: [{ order: 1, tile: "5s" }] },
      },
    };
    const card = problemOgCard({ ...problem, problem: callProblem });
    expect(card.info).toBe("鳴き判断・西場 9巡目");
    expect(card.drawn).toBeNull();
    expect(card.hand).toHaveLength(13);
  });

  it("下書き・不存在は汎用カード（問題情報・手牌を一切含めない）", () => {
    const draft = problemOgCard({ ...problem, status: "draft", problem: discardProblem });
    expect(draft.title).not.toContain("押し引き");
    expect(draft.hand).toEqual([]);
    expect(draft.drawn).toBeNull();
    expect(problemOgCard(null)).toEqual(draft);
  });

  it("スキーマ検証に落ちる問題データは手牌を出さない（タイトルのみ。信頼ゲート）", () => {
    const card = problemOgCard({ ...problem, problem: { broken: true } });
    expect(card.title).toBe("南3局の押し引き");
    expect(card.hand).toEqual([]);
    expect(card.drawn).toBeNull();
  });
});

const profile: PublicProfileSummary = {
  id: "user-abcdef012345",
  handle: "ajiki",
  displayName: "あじき",
  games: [{}, {}],
};

describe("buildProfileMetadata", () => {
  it("公開プロフィールからタイトル・説明・OGPを組み立てる（title は「表示名（@handle）」）", () => {
    const meta = buildProfileMetadata(profile);
    expect(meta.title).toBe("あじき（@ajiki）");
    expect(meta.description).toContain("公開牌譜");
    expect(meta.description).toContain("2件");
    expect(meta.openGraph?.type).toBe("profile");
    expect(meta.openGraph?.url).toBe("/u/ajiki");
    expect(meta.alternates?.canonical).toBe("/u/ajiki");
  });

  it("handle が無いユーザーは表示名だけをタイトルにし、URL は id で組む", () => {
    const meta = buildProfileMetadata({ ...profile, handle: null });
    expect(meta.title).toBe("あじき");
    expect(meta.openGraph?.url).toBe("/u/user-abcdef012345");
  });

  it("不存在（null）ではサイト既定にフォールバックする", () => {
    const meta = buildProfileMetadata(null);
    expect(meta.title).toBe(DEFAULT_TITLE);
    expect(meta.openGraph).toBeUndefined();
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
