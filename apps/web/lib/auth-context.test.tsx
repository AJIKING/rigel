import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? `user:${user.id}` : "anon"}</div>;
}

function stubMe(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );
}

describe("AuthProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("セッションが無ければ未ログイン", async () => {
    stubMe({ user: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("anon")).toBeDefined());
  });

  it("Cookie セッションがあれば /api/me でユーザーを復元する", async () => {
    stubMe({ user: { id: "u1", plan: "free" } });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("user:u1")).toBeDefined());
  });

  it("/api/me が失敗しても未ログインで確定する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("network"))),
    );
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("anon")).toBeDefined());
  });
});

function SignInProbe() {
  const { user, signInWithGoogle, signInWithApple } = useAuth();
  return (
    <>
      <span>{user ? `user:${user.id}` : "anon"}</span>
      <button onClick={() => void signInWithGoogle("id-tok")}>google</button>
      <button onClick={() => void signInWithApple("id-tok", "code")}>apple</button>
    </>
  );
}

/** /api/me は未ログイン、/api/session（POST）は指定レスポンスを返す fetch スタブ。 */
function stubSession(session: { user: { id: string }; created?: boolean }) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) =>
      Promise.resolve(
        new Response(JSON.stringify(String(url).includes("/api/me") ? { user: null } : session)),
      ),
    ),
  );
}

describe("AuthProvider の計測（login / sign_up）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { gtag?: unknown }).gtag;
  });

  it("初回登録（created=true）は sign_up をプロバイダ付きで送る", async () => {
    const gtag = vi.fn();
    (window as { gtag?: unknown }).gtag = gtag;
    stubSession({ user: { id: "u1" }, created: true });
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );
    await screen.findByText("anon");

    fireEvent.click(screen.getByText("apple"));

    await screen.findByText("user:u1");
    await waitFor(() => expect(gtag).toHaveBeenCalledWith("event", "sign_up", { method: "apple" }));
  });

  it("既存ユーザー（created=false）は login を送る", async () => {
    const gtag = vi.fn();
    (window as { gtag?: unknown }).gtag = gtag;
    stubSession({ user: { id: "u2" }, created: false });
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );
    await screen.findByText("anon");

    fireEvent.click(screen.getByText("google"));

    await screen.findByText("user:u2");
    await waitFor(() => expect(gtag).toHaveBeenCalledWith("event", "login", { method: "google" }));
  });

  it("gtag が無い環境でもログイン自体は成立する", async () => {
    stubSession({ user: { id: "u3" }, created: false });
    render(
      <AuthProvider>
        <SignInProbe />
      </AuthProvider>,
    );
    await screen.findByText("anon");
    fireEvent.click(screen.getByText("google"));
    expect(await screen.findByText("user:u3")).toBeTruthy();
  });
});
