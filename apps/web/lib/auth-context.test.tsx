import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./auth-context";

function Probe() {
  const { user, loading } = useAuth();
  if (loading) return <div>loading</div>;
  return <div>{user ? `user:${user.id}` : "anon"}</div>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("保存済みトークンが無ければ未ログイン", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("anon")).toBeDefined());
  });

  it("保存済みトークンがあれば /me で復元する", async () => {
    localStorage.setItem("rigel.session", "tok");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(new Response(JSON.stringify({ id: "u1", plan: "free" }), { status: 200 })),
      ),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("user:u1")).toBeDefined());
  });

  it("/me が失敗したらトークンを捨てて未ログインにする", async () => {
    localStorage.setItem("rigel.session", "bad");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("no", { status: 401 }))),
    );

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText("anon")).toBeDefined());
    expect(localStorage.getItem("rigel.session")).toBeNull();
  });
});
