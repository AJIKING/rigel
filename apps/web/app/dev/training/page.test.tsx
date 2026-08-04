import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubMe } from "../../../components/problem/test-helpers";
import { AuthProvider } from "../../../lib/auth-context";

// TrainingScreen が既定値として import する Server Action（server-only）をスタブする。
// dev ページは fake を注入するため、これらは呼ばれないことも検証できる。
const actions = vi.hoisted(() => ({
  startQuizSessionAction: vi.fn(),
  finishQuizSessionAction: vi.fn(),
  listQuizSessionsAction: vi.fn(),
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
    expect(await screen.findByRole("button", { name: /清一色 何待ち/ })).toBeTruthy();
  });

  it("?phase=running&kind=score で点数計算のセッションを直接表示できる（既定の実生成経路）", async () => {
    stubMe(null);
    nav.params = new URLSearchParams("phase=running&kind=score&seed=1");
    render(
      <AuthProvider>
        <DevTrainingPage />
      </AuthProvider>,
    );
    // 既定の generateQuestion（本物の生成器）で出題される配線を確認する
    // （出題の中身は seed で決定的だが、実測値の焼き付けはしない=生成×採点の正しさは
    // @rigel/ui のテストが担保。条件ラベルの形だけを見る）。
    expect(await screen.findByText("点数を選ぶ")).toBeTruthy();
    // 条件ラベルは対局表記「東◯局 ◯家 (リーチ) ツモ/ロン」（[決定] 2026-08-04）。
    expect((await screen.findByText(/^[東南][1-4]局 .家/)).textContent).toMatch(
      /^[東南][1-4]局 [東南西北]家( リーチ)? (ツモ|ロン)$/,
    );
    expect(actions.startQuizSessionAction).not.toHaveBeenCalled();
  });

  it("?phase=result で60秒もカウントダウンも待たずに結果画面を直接表示できる（devショートカット）", async () => {
    stubMe(null);
    nav.params = new URLSearchParams("phase=result&kind=efficiency&seed=1");
    render(
      <AuthProvider>
        <DevTrainingPage />
      </AuthProvider>,
    );
    // 新フロー（カード→開始ダイアログ→開始→カウントダウン）はフィクスチャが自動で踏み、
    // countdownSeconds=0 でカウントダウンを飛ばす（実タイマーでも待たない）。
    expect(await screen.findByText("結果")).toBeTruthy();
    // セッション開始・結果送信・直近記録の取得はフェイク注入分が使われ、
    // 本物の Server Action は呼ばれない。
    expect(actions.startQuizSessionAction).not.toHaveBeenCalled();
    expect(actions.finishQuizSessionAction).not.toHaveBeenCalled();
    expect(actions.listQuizSessionsAction).not.toHaveBeenCalled();
  });
});
