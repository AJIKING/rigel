import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubMe } from "../../../components/problem/test-helpers";
import { AuthProvider } from "../../../lib/auth-context";

// TrainingScreen が既定値として import する Server Action（server-only）をスタブする。
// dev ページは fake を注入するため、これらは呼ばれないことも検証できる。
const actions = vi.hoisted(() => ({
  startQuizSessionAction: vi.fn(),
  finishQuizSessionAction: vi.fn(),
}));
vi.mock("../../../app/actions", () => actions);

// next/navigation をスタブ（notFound は本物同様に throw で描画を止める）。
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: vi.fn() }),
  notFound: nav.notFound,
}));

import DevTrainingPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  nav.params = new URLSearchParams();
  nav.notFound.mockClear();
});

describe("/dev/training（特訓UIの目視検証用フィクスチャ）", () => {
  it("NODE_ENV=production では notFound になる（本番には出さない）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => render(<DevTrainingPage />)).toThrowError("NEXT_NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
  });

  it("開発環境では API・ログイン不要で種目選択が表示される（fake user は free）", async () => {
    stubMe(null); // /api/me は未ログイン応答 = 実認証に依存しないことの確認。
    render(
      <AuthProvider>
        <DevTrainingPage />
      </AuthProvider>,
    );
    expect(await screen.findByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
  });

  it("?phase=result で60秒待たずに結果画面を直接表示できる（devショートカット）", async () => {
    stubMe(null);
    nav.params = new URLSearchParams("phase=result&kind=efficiency&seed=1");
    render(
      <AuthProvider>
        <DevTrainingPage />
      </AuthProvider>,
    );
    expect(await screen.findByText("結果")).toBeTruthy();
    // セッション開始・結果送信はフェイク注入分が使われ、本物の Server Action は呼ばれない。
    expect(actions.startQuizSessionAction).not.toHaveBeenCalled();
    expect(actions.finishQuizSessionAction).not.toHaveBeenCalled();
  });
});
