import { describe, expect, it } from "vitest";
import type { KifuStatus, Visibility } from "./game-log";
import { isVisibleTo } from "./game-log";

describe("isVisibleTo（局の可視性判定）", () => {
  const OWNER = "owner-1";

  it.each<{
    name: string;
    visibility: Visibility;
    status: KifuStatus;
    viewerId: string | null;
    expected: boolean;
  }>([
    {
      name: "public+complete は所有者本人に見える",
      visibility: "public",
      status: "complete",
      viewerId: OWNER,
      expected: true,
    },
    {
      name: "public+complete は他人にも見える",
      visibility: "public",
      status: "complete",
      viewerId: "other",
      expected: true,
    },
    {
      name: "public+complete は未ログインにも見える",
      visibility: "public",
      status: "complete",
      viewerId: null,
      expected: true,
    },
    {
      name: "private は所有者本人には見える",
      visibility: "private",
      status: "complete",
      viewerId: OWNER,
      expected: true,
    },
    {
      name: "private は他人には見えない",
      visibility: "private",
      status: "complete",
      viewerId: "other",
      expected: false,
    },
    {
      name: "private は未ログインには見えない",
      visibility: "private",
      status: "complete",
      viewerId: null,
      expected: false,
    },
    // [決定] 2026-08-03 オーナー: 公開フィード・公開ビューア・お気に入りと同じ規律に揃える。
    // 公開範囲は半荘単位で新局が public を引き継ぐため、揃えないと「目検前の AI ドラフト局」が
    // 追加解析の直後から他人に取得できてしまう。
    {
      name: "public でも draft は他人には見えない（目検前のドラフトを公開しない）",
      visibility: "public",
      status: "draft",
      viewerId: "other",
      expected: false,
    },
    {
      name: "public でも draft は未ログインには見えない",
      visibility: "public",
      status: "draft",
      viewerId: null,
      expected: false,
    },
    {
      name: "public+draft でも所有者本人には見える（自分の下書きは編集する）",
      visibility: "public",
      status: "draft",
      viewerId: OWNER,
      expected: true,
    },
    {
      name: "private+draft も所有者本人には見える",
      visibility: "private",
      status: "draft",
      viewerId: OWNER,
      expected: true,
    },
  ])("$name", ({ visibility, status, viewerId, expected }) => {
    expect(isVisibleTo({ userId: OWNER, visibility, status }, viewerId)).toBe(expected);
  });
});
