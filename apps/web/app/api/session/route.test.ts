// BFF ログイン/ログアウト（/api/session）のルート契約テスト。
// Route Handler は Server Action と違い Next の Origin チェックが入らないため、
// 同一オリジン必須（ログイン CSRF / セッション固定化対策）を自前で持つ——その退行をここで止める。
// あわせて「レスポンスにセッショントークンを含めない」（トークンは HttpOnly Cookie のみ）も固定する。

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  authWithGoogle: vi.fn(),
  authWithApple: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));
vi.mock("../../../lib/api-server", () => ({
  authWithGoogle: h.authWithGoogle,
  authWithApple: h.authWithApple,
}));
vi.mock("../../../lib/session", () => ({
  setSessionCookie: h.setSessionCookie,
  clearSessionCookie: h.clearSessionCookie,
}));

import { DELETE, POST } from "./route";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://app.test/api/session", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const SAME_ORIGIN = { origin: "https://app.test", host: "app.test" };

beforeEach(() => {
  h.authWithGoogle.mockReset();
  h.authWithApple.mockReset();
  h.setSessionCookie.mockReset();
  h.clearSessionCookie.mockReset();
});

describe("POST /api/session（ログイン）", () => {
  it("Origin ヘッダ無し・別オリジンは 403（ログイン CSRF・セッション固定化対策）", async () => {
    expect((await POST(post({ idToken: "t" }))).status).toBe(403);
    expect(
      (await POST(post({ idToken: "t" }, { origin: "https://evil.test", host: "app.test" })))
        .status,
    ).toBe(403);
    expect(h.authWithGoogle).not.toHaveBeenCalled();
  });

  it("idToken 無しは 400", async () => {
    const res = await POST(post({}, SAME_ORIGIN));
    expect(res.status).toBe(400);
  });

  it("api の検証失敗（例外含む）は 401 で Cookie を張らない", async () => {
    h.authWithGoogle.mockRejectedValue(new Error("bad token"));
    const res = await POST(post({ idToken: "bad" }, SAME_ORIGIN));
    expect(res.status).toBe(401);
    expect(h.setSessionCookie).not.toHaveBeenCalled();
  });

  it("成功で Cookie を張り、レスポンスにトークンを含めない（HttpOnly の意味を壊さない）", async () => {
    h.authWithGoogle.mockResolvedValue({
      sessionToken: "secret-jwt",
      created: true,
      user: { id: "u1", plan: "free" },
    });

    const res = await POST(post({ idToken: "good" }, SAME_ORIGIN));

    expect(res.status).toBe(200);
    expect(h.setSessionCookie).toHaveBeenCalledWith("secret-jwt");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({ user: { id: "u1", plan: "free" }, created: true });
    expect(JSON.stringify(body)).not.toContain("secret-jwt");
  });

  it("provider=apple は authWithApple へ（authorizationCode も渡す）", async () => {
    h.authWithApple.mockResolvedValue({
      sessionToken: "jwt-a",
      created: false,
      user: { id: "u1" },
    });

    const res = await POST(
      post({ idToken: "apple-id", provider: "apple", authorizationCode: "code-1" }, SAME_ORIGIN),
    );

    expect(res.status).toBe(200);
    expect(h.authWithApple).toHaveBeenCalledWith("apple-id", "code-1");
    expect(h.authWithGoogle).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/session（ログアウト）", () => {
  it("別オリジンは 403 で Cookie を消さない", async () => {
    const res = await DELETE(
      new Request("https://app.test/api/session", {
        method: "DELETE",
        headers: { origin: "https://evil.test", host: "app.test" },
      }),
    );
    expect(res.status).toBe(403);
    expect(h.clearSessionCookie).not.toHaveBeenCalled();
  });

  it("同一オリジンなら Cookie を破棄する", async () => {
    const res = await DELETE(
      new Request("https://app.test/api/session", { method: "DELETE", headers: SAME_ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(h.clearSessionCookie).toHaveBeenCalledTimes(1);
  });
});
