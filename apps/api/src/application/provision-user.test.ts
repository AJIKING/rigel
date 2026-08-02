// 初回ログインのランダム handle 付与（uniqueHandle）の直接テスト。
// 2026-08-01 の品質調査で「衝突ループ・20文字上限の切り詰めが未検証」と指摘された穴を塞ぐ。

import { describe, expect, it } from "vitest";
import { User } from "../domain/user/user";
import { InMemoryUserRepository } from "../test-support/in-memory";
import { uniqueHandle } from "./provision-user";

const NOW = new Date("2026-08-02T00:00:00.000Z");

function usersWithHandles(handles: string[]) {
  return new InMemoryUserRepository(
    handles.map((handle, i) =>
      User.create({ id: `u${i}`, googleSub: `sub-${i}`, now: NOW, handle, displayName: handle }),
    ),
  );
}

describe("uniqueHandle", () => {
  it("未使用ならそのまま使う", async () => {
    expect(await uniqueHandle(usersWithHandles([]), "taro")).toBe("taro");
  });

  it("衝突したら連番を足して一意にする（2 から順に空きを探す）", async () => {
    expect(await uniqueHandle(usersWithHandles(["taro"]), "taro")).toBe("taro2");
    expect(await uniqueHandle(usersWithHandles(["taro", "taro2", "taro3"]), "taro")).toBe("taro4");
  });

  it("20文字の base が衝突しても、連番込みで20文字上限を守る", async () => {
    const base = "a".repeat(20);
    const result = await uniqueHandle(usersWithHandles([base]), base);
    expect(result).toBe(`${"a".repeat(19)}2`);
    expect(result.length).toBeLessThanOrEqual(20);
  });
});
