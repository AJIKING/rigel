import { describe, expect, it } from "vitest";
import type { Game } from "../domain/game/game";
import type { GameLog } from "../domain/kifu/game-log";
import type { ProblemPost } from "../domain/problem/problem";
import { firstOfNextMonthUtc, User } from "../domain/user/user";
import {
  InMemoryFavoriteRepository,
  InMemoryGameLogRepository,
  InMemoryGameRepository,
  InMemoryProblemRepository,
  InMemoryUserRepository,
} from "../test-support/in-memory";
import { validKifu } from "../test-support/kifu";
import { makeProblemData } from "../test-support/problem";
import { GetFavoriteSummary, ListMyFavorites, SetFavorite } from "./favorite.usecase";

const NOW = new Date("2026-07-26T00:00:00.000Z");

function user(id: string, displayName = `名前${id}`): User {
  return new User({
    id,
    googleSub: `g-${id}`,
    plan: "free",
    handle: `h${id}`,
    displayName,
    analysisCountThisMonth: 0,
    countResetAt: firstOfNextMonthUtc(NOW),
  });
}

function game(id: string, userId: string): Game {
  return { id, userId, title: `半荘${id}`, createdAt: NOW };
}

function log(id: string, gameId: string, userId: string, over: Partial<GameLog> = {}): GameLog {
  return {
    id,
    userId,
    gameId,
    seq: 1,
    kifu: validKifu,
    visibility: "public",
    status: "complete",
    createdAt: NOW,
    ...over,
  };
}

function post(
  id: string,
  userId: string,
  status: "draft" | "published" = "published",
): ProblemPost {
  return {
    id,
    userId,
    title: `問題${id}`,
    problem: makeProblemData(),
    status,
    photoDraftId: null,
    createdAt: NOW,
  };
}

/**
 * 既定の世界（me=自分・other=他人）:
 *   g-pub   … other の公開半荘 / g-priv  … other の非公開半荘
 *   g-mine  … me の非公開半荘
 *   p-pub   … other の公開問題 / p-draft … other の下書き問題 / p-mine … me の下書き問題
 */
function world() {
  const users = new InMemoryUserRepository([user("me"), user("other")]);
  const games = new InMemoryGameRepository([
    game("g-pub", "other"),
    game("g-priv", "other"),
    game("g-mine", "me"),
  ]);
  const gameLogs = new InMemoryGameLogRepository([
    log("l1", "g-pub", "other"),
    log("l2", "g-priv", "other", { visibility: "private" }),
    log("l3", "g-mine", "me", { visibility: "private", status: "draft" }),
  ]);
  const problems = new InMemoryProblemRepository([
    post("p-pub", "other"),
    post("p-draft", "other", "draft"),
    post("p-mine", "me", "draft"),
  ]);
  const favorites = new InMemoryFavoriteRepository();
  const now = () => NOW;
  return {
    favorites,
    problems,
    setFavorite: new SetFavorite({ favorites, games, gameLogs, problems, now }),
    summary: new GetFavoriteSummary(favorites),
    listMine: new ListMyFavorites({ favorites, games, gameLogs, problems, users }),
  };
}

describe("SetFavorite（付ける/外す）", () => {
  it("公開されている半荘・問題には付けられ、件数を返す", async () => {
    const w = world();
    expect(await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-pub", faved: true })).toEqual({ ok: true, favoriteCount: 1 }); // prettier-ignore
    expect(await w.setFavorite.execute({ userId: "me", targetType: "problem", targetId: "p-pub", faved: true })).toEqual({ ok: true, favoriteCount: 1 }); // prettier-ignore
  });

  it("自分のものは非公開・下書きでも付けられる（マイページの★）", async () => {
    const w = world();
    expect(await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-mine", faved: true })).toEqual({ ok: true, favoriteCount: 1 }); // prettier-ignore
    expect(await w.setFavorite.execute({ userId: "me", targetType: "problem", targetId: "p-mine", faved: true })).toEqual({ ok: true, favoriteCount: 1 }); // prettier-ignore
  });

  it("他人の非公開・下書き・存在しない対象は not_found（存在の有無を漏らさない）", async () => {
    const w = world();
    for (const [targetType, targetId] of [
      ["game", "g-priv"],
      ["game", "missing"],
      ["problem", "p-draft"],
      ["problem", "missing"],
    ] as const) {
      expect(await w.setFavorite.execute({ userId: "me", targetType, targetId, faved: true })).toEqual({ ok: false, reason: "not_found" }); // prettier-ignore
    }
  });

  it("二度押しは1件のまま（冪等）。外すと 0 に戻る", async () => {
    const w = world();
    const on = { userId: "me", targetType: "game", targetId: "g-pub", faved: true } as const;
    await w.setFavorite.execute(on);
    expect(await w.setFavorite.execute(on)).toEqual({ ok: true, favoriteCount: 1 });
    expect(await w.setFavorite.execute({ ...on, faved: false })).toEqual({ ok: true, favoriteCount: 0 }); // prettier-ignore
  });

  it("件数は付けた人数（自分＋他人）で数える", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore
    expect(await w.setFavorite.execute({ userId: "other", targetType: "game", targetId: "g-pub", faved: true })).toEqual({ ok: true, favoriteCount: 2 }); // prettier-ignore
  });
});

describe("GetFavoriteSummary（一覧カードに重ねる集計）", () => {
  it("件数と『自分が付けたか』を返す。0件の対象はキーごと省く", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore
    await w.setFavorite.execute({ userId: "other", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore

    expect(
      await w.summary.execute({
        viewerId: "me",
        targetType: "game",
        targetIds: ["g-pub", "g-mine"],
      }),
    ).toEqual({ counts: { "g-pub": 2 }, mine: ["g-pub"] });
  });

  it("未ログイン（viewerId 無し）でも件数は返し、mine は空（誰が付けたかは出さない）", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore

    expect(await w.summary.execute({ targetType: "game", targetIds: ["g-pub"] })).toEqual({
      counts: { "g-pub": 1 },
      mine: [],
    });
  });
});

describe("ListMyFavorites（マイページのお気に入りタブ）", () => {
  /** ok を剥がして中身を返す（invalid ならテスト失敗）。 */
  const listMine = async (w: ReturnType<typeof world>, cursor?: string) => {
    const out = await w.listMine.execute("me", cursor);
    if (!out.ok) throw new Error("ok のはず");
    return out;
  };

  it("他人の公開物と自分のもの（非公開・下書き含む）を、付けた新しい順で返す", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-mine", faved: true }); // prettier-ignore
    // g-pub のほうが後（＝新しい）になるよう時刻をずらして付ける。
    await w.favorites.add({ userId: "me", targetType: "game", targetId: "g-pub", createdAt: new Date(NOW.getTime() + 1000) }); // prettier-ignore
    await w.setFavorite.execute({ userId: "me", targetType: "problem", targetId: "p-pub", faved: true }); // prettier-ignore
    // p-mine のほうが後（＝新しい）。
    await w.favorites.add({ userId: "me", targetType: "problem", targetId: "p-mine", createdAt: new Date(NOW.getTime() + 1000) }); // prettier-ignore

    const out = await listMine(w);
    expect(out.games.map((g) => [g.id, g.mine])).toEqual([
      ["g-pub", false],
      ["g-mine", true],
    ]);
    expect(out.problems.map((p) => [p.id, p.mine])).toEqual([
      ["p-mine", true],
      ["p-pub", false],
    ]);
  });

  it("お気に入り後に他人が非公開/下書きへ戻した・削除したものは落とす（幽霊を出さない）", async () => {
    const w = world();
    await w.favorites.add({ userId: "me", targetType: "game", targetId: "g-priv", createdAt: NOW });
    await w.favorites.add({ userId: "me", targetType: "game", targetId: "gone", createdAt: NOW });
    await w.favorites.add({ userId: "me", targetType: "problem", targetId: "p-draft", createdAt: NOW }); // prettier-ignore
    await w.favorites.add({
      userId: "me",
      targetType: "problem",
      targetId: "gone",
      createdAt: NOW,
    });

    expect(await w.listMine.execute("me")).toEqual({
      ok: true,
      games: [],
      problems: [],
      nextCursor: null,
    });
  });

  it("カードに著者（handle/表示名）とお気に入り数を載せる", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore
    await w.setFavorite.execute({ userId: "other", targetType: "game", targetId: "g-pub", faved: true }); // prettier-ignore

    const [card] = (await listMine(w)).games;
    expect(card).toMatchObject({
      id: "g-pub",
      ownerId: "other",
      ownerHandle: "hother",
      ownerName: "名前other",
      kyokuCount: 1,
      favoriteCount: 2,
      mine: false,
    });
  });

  it("自分の半荘は全局を、他人の半荘は公開局だけを数える（各一覧の表示と揃える）", async () => {
    const w = world();
    await w.setFavorite.execute({ userId: "me", targetType: "game", targetId: "g-mine", faved: true }); // prettier-ignore
    // g-mine は非公開・下書きの1局だけ。自分のものなので局数は 1 で出る。
    expect((await listMine(w)).games[0]).toMatchObject({ kyokuCount: 1, mine: true });
  });

  it("30件を超えると nextCursor を返し、次ページに重複なく続く（見えない対象で数を欠いてもページは進む）", async () => {
    const w = world();
    // 同一対象へのお気に入りは1人1件なので、対象を31件ぶん用意する（公開問題で揃える）。
    for (let i = 0; i < 31; i++) {
      const id = `pp${String(i).padStart(2, "0")}`;
      await w.problems.save(post(id, "other"));
      await w.favorites.add({
        userId: "me",
        targetType: "problem",
        targetId: id,
        createdAt: new Date(NOW.getTime() + i * 1000),
      });
    }

    const page1 = await listMine(w);
    expect(page1.problems).toHaveLength(30);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listMine(w, page1.nextCursor!);
    expect(page2.problems.map((p) => p.id)).toEqual(["pp00"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("不正カーソルは invalid", async () => {
    expect(await world().listMine.execute("me", "junk")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
