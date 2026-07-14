import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";

// Server Action はモック（app/actions は server-only を辿るため実体は読み込まない）。
const h = vi.hoisted(() => ({
  analyzeAction: vi.fn(),
  createEmptyKifuAction: vi.fn(),
  createGameAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);

import { AddKyokuModal } from "./AddKyokuModal";

/** /api/me をスタブしてプランを差し込む（AuthProvider が起動時に読む）。extra で残枠なども足せる。 */
function stubMe(plan: string | null, extra: Record<string, unknown> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ user: plan ? { id: "u1", plan, ...extra } : null }),
    })),
  );
}

function renderModal() {
  return render(
    <AuthProvider>
      <AddKyokuModal onClose={() => {}} onDone={() => {}} />
    </AuthProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AddKyokuModal のプラン別出し分け（mobile の Capture と同一方針）", () => {
  it("free プランでは AI再現を出さず手動入力のみ＋アップセル文言", async () => {
    stubMe("free");
    renderModal();
    // 手動入力フォームが最初から出る（AI再現タブ・ボタンは出ない）。
    expect(await screen.findByText(/写真からのAI再現/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI再現" })).toBeNull();
    expect(screen.getByRole("button", { name: "手動作成" })).toBeTruthy();
  });

  it("有料プラン（next）では AI再現タブが出る", async () => {
    stubMe("next");
    renderModal();
    expect((await screen.findAllByRole("button", { name: "AI再現" })).length).toBeGreaterThan(0);
    expect(screen.queryByText(/写真からのAI再現（撮影→自動で牌譜化）/)).toBeNull();
  });

  it("解析の残枠を撮る前に見せる（送信後の枠切れで撮影の手間を無駄にしない。mobile Capture と同方針）", async () => {
    stubMe("next", { remainingCalls: 92, monthlyCallQuota: 100 });
    renderModal();
    expect(await screen.findByText("解析枠 残り 92 / 100（今月）")).toBeTruthy();
  });
});
