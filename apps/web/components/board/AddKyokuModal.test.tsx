import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";

// Server Action はモック（app/actions は server-only を辿るため実体は読み込まない）。
const h = vi.hoisted(() => ({
  analyzeAction: vi.fn(),
  getAnalysisJobAction: vi.fn(),
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

describe("AddKyokuModal の非同期解析（202 + ポーリング。docs/plans/async-analysis.md）", () => {
  /** 河の写真を1枚選ぶ（PhotoField の file input へ直接入れる）。 */
  function pickRiver(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File(["img"], "river.jpg", { type: "image/jpeg" })] },
    });
  }

  it("解析ジョブが done になったら onDone(logId, gameId) を呼ぶ", async () => {
    stubMe("next");
    h.analyzeAction.mockResolvedValue({ ok: true, jobId: "job-1" });
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "done",
      gameId: "g1",
      logId: "l1",
      reason: null,
    });
    const onDone = vi.fn();
    const { container } = render(
      <AuthProvider>
        <AddKyokuModal onClose={() => {}} onDone={onDone} />
      </AuthProvider>,
    );
    await screen.findAllByRole("button", { name: "AI再現" });

    pickRiver(container);
    fireEvent.click(screen.getAllByRole("button", { name: "AI再現" }).at(-1)!);

    await waitFor(() => expect(onDone).toHaveBeenCalledWith("l1", "g1"));
  });

  it("ジョブが failed なら理由の文言を表示し onDone を呼ばない", async () => {
    stubMe("next");
    h.analyzeAction.mockResolvedValue({ ok: true, jobId: "job-1" });
    h.getAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "failed",
      gameId: null,
      logId: null,
      reason: "game_full",
    });
    const onDone = vi.fn();
    const { container } = render(
      <AuthProvider>
        <AddKyokuModal onClose={() => {}} onDone={onDone} />
      </AuthProvider>,
    );
    await screen.findAllByRole("button", { name: "AI再現" });

    pickRiver(container);
    fireEvent.click(screen.getAllByRole("button", { name: "AI再現" }).at(-1)!);

    await waitFor(() => expect(screen.getByText(/30局/)).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
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
