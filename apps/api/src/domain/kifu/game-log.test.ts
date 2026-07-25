import { describe, expect, it } from "vitest";
import type { Visibility } from "./game-log";
import { isVisibleTo } from "./game-log";

describe("isVisibleTo（局の可視性判定）", () => {
  const OWNER = "owner-1";

  it.each<{ name: string; visibility: Visibility; viewerId: string | null; expected: boolean }>([
    { name: "public は所有者本人に見える", visibility: "public", viewerId: OWNER, expected: true },
    { name: "public は他人にも見える", visibility: "public", viewerId: "other", expected: true },
    { name: "public は未ログインにも見える", visibility: "public", viewerId: null, expected: true },
    {
      name: "private は所有者本人には見える",
      visibility: "private",
      viewerId: OWNER,
      expected: true,
    },
    {
      name: "private は他人には見えない",
      visibility: "private",
      viewerId: "other",
      expected: false,
    },
    {
      name: "private は未ログインには見えない",
      visibility: "private",
      viewerId: null,
      expected: false,
    },
  ])("$name", ({ visibility, viewerId, expected }) => {
    expect(isVisibleTo({ userId: OWNER, visibility }, viewerId)).toBe(expected);
  });
});
