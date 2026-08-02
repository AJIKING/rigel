// BFF セッション Cookie（HttpOnly）の特性テスト。
// 2026-08-01 の品質調査で「web の認証経路がテストゼロ」と指摘された空白を塞ぐ。
// Cookie 属性（HttpOnly / SameSite=Lax / Secure(本番) / 30日）は XSS・CSRF 対策の
// 前提そのものなので、値ではなく属性の退行をここで止める。

import { afterEach, describe, expect, it, vi } from "vitest";

type SetOpts = {
  httpOnly?: boolean;
  sameSite?: string;
  secure?: boolean;
  path?: string;
  maxAge?: number;
};

const jar = vi.hoisted(() => {
  const store = new Map<string, { value: string; opts?: SetOpts }>();
  return {
    store,
    get: (name: string) => (store.has(name) ? { value: store.get(name)!.value } : undefined),
    set: (name: string, value: string, opts?: SetOpts) => void store.set(name, { value, opts }),
    delete: (name: string) => void store.delete(name),
  };
});
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(jar) }));

import { clearSessionCookie, getSessionToken, setSessionCookie, SESSION_COOKIE } from "./session";

afterEach(() => {
  jar.store.clear();
  vi.unstubAllEnvs();
});

describe("session（BFF の first-party Cookie）", () => {
  it("getSessionToken: Cookie が無ければ null、有れば値を返す", async () => {
    expect(await getSessionToken()).toBeNull();
    jar.store.set(SESSION_COOKIE, { value: "tok-1" });
    expect(await getSessionToken()).toBe("tok-1");
  });

  it("setSessionCookie: HttpOnly / SameSite=Lax / path=/ / 30日で張る（XSS・CSRF 対策の前提）", async () => {
    await setSessionCookie("tok-2");
    const entry = jar.store.get(SESSION_COOKIE);
    expect(entry?.value).toBe("tok-2");
    expect(entry?.opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  });

  it("setSessionCookie: Secure 属性は本番だけ true（http のローカル開発で消えない）", async () => {
    await setSessionCookie("tok-dev");
    expect(jar.store.get(SESSION_COOKIE)?.opts?.secure).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie("tok-prod");
    expect(jar.store.get(SESSION_COOKIE)?.opts?.secure).toBe(true);
  });

  it("clearSessionCookie: Cookie を破棄する（ログアウト・退会）", async () => {
    jar.store.set(SESSION_COOKIE, { value: "tok-3" });
    await clearSessionCookie();
    expect(await getSessionToken()).toBeNull();
  });
});
