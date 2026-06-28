import { describe, expect, it } from "vitest";
import { JwtSessionService } from "./jwt-session-service";

describe("JwtSessionService", () => {
  const session = new JwtSessionService({ secret: "test-secret-value" });

  it("発行したトークンを検証して userId を取り出せる", async () => {
    const token = await session.issue("user-1");
    expect(await session.verify(token)).toEqual({ userId: "user-1" });
  });

  it("壊れた/偽のトークンは null", async () => {
    expect(await session.verify("not-a-jwt")).toBeNull();
  });

  it("別の鍵で署名されたトークンは受け付けない", async () => {
    const other = new JwtSessionService({ secret: "different-secret" });
    const token = await other.issue("user-1");
    expect(await session.verify(token)).toBeNull();
  });
});
