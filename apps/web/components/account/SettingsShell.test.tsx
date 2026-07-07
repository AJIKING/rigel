import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

// Server Action は server-only を辿るためモック。呼び出し引数（plan/URL）を検証する。
const h = vi.hoisted(() => ({
  createCheckoutAction: vi.fn(),
  createPortalAction: vi.fn(),
  deleteAccountAction: vi.fn(),
  updateProfileAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

// 決済URLへの遷移（外部オリジン）。jsdom は window.location を再定義できず遷移先を
// 観測できないため、遷移はこのシーム越しに検証する。
const redirectTo = vi.hoisted(() => vi.fn());
vi.mock("../../lib/navigation", () => ({ redirectTo }));

import { SettingsShell } from "./SettingsShell";

/** ログイン済み（plan 指定）で設定画面を表示し、認証の復元完了まで待つ。 */
async function renderSettings(plan: string) {
  stubMe(plan);
  render(
    <AuthProvider>
      <SettingsShell />
    </AuthProvider>,
  );
  await screen.findByRole("heading", { name: "設定", level: 1 });
}

/** プラン変更モーダル内のプランカード（Next/Pro/Free）の選択ボタンを探す。 */
function planCardButton(name: "Free" | "Next" | "Pro"): HTMLElement {
  // プラン名（plName）は現在プラン表示（cpName）と重複しうるため、
  // 同じカード内に選択ボタンを持つ要素だけをカードとみなす。
  for (const label of screen.getAllByText(name)) {
    const btn = within(label.parentElement as HTMLElement).queryByRole("button", {
      name: /このプランにする|利用中/,
    });
    if (btn) return btn;
  }
  throw new Error(`プランカードが見つかりません: ${name}`);
}

beforeEach(() => {
  h.createCheckoutAction.mockReset();
  h.createPortalAction.mockReset();
  redirectTo.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SettingsShell: プラン購入（free → 有料）", () => {
  it.each([
    { label: "Next" as const, plan: "next" },
    { label: "Pro" as const, plan: "pro" },
  ])(
    "free ユーザーが $label を選ぶと plan=$plan で checkout が作られ決済URLへ遷移する",
    async ({ label, plan }) => {
      h.createCheckoutAction.mockResolvedValue({ ok: true, url: "https://stripe.test/pay" });
      await renderSettings("free");

      fireEvent.click(screen.getByRole("button", { name: "プラン変更" }));
      fireEvent.click(planCardButton(label));

      await waitFor(() =>
        expect(h.createCheckoutAction).toHaveBeenCalledWith({
          plan,
          successUrl: `${window.location.origin}/settings`,
          cancelUrl: `${window.location.origin}/settings`,
        }),
      );
      await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("https://stripe.test/pay"));
      // 加入中向けのポータルは呼ばない（新規加入は Checkout）。
      expect(h.createPortalAction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 409, message: "プランの変更・解約は決済ポータルから行えます。" },
    { status: 501, message: "課金は準備中です。" },
    { status: 500, message: "開始できませんでした。" },
  ])(
    "checkout が $status で失敗するとユーザー向け文言を出し遷移しない",
    async ({ status, message }) => {
      h.createCheckoutAction.mockResolvedValue({ ok: false, status });
      await renderSettings("free");

      fireEvent.click(screen.getByRole("button", { name: "プラン変更" }));
      fireEvent.click(planCardButton("Next"));

      expect(await screen.findByText(message)).toBeTruthy();
      expect(redirectTo).not.toHaveBeenCalled();
      // モーダルは閉じる（エラー文言が隠れないように）。
      expect(screen.queryByRole("button", { name: "このプランにする" })).toBeNull();
    },
  );
});

describe("SettingsShell: 加入中ユーザー", () => {
  it("現在のプラン名と月額が表示され、モーダルでは現在プランが「利用中」で無効になる", async () => {
    await renderSettings("next");

    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.getByText("¥480 / 月")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "プラン変更" }));
    const current = planCardButton("Next");
    expect(current.textContent).toBe("利用中");
    expect(current).toHaveProperty("disabled", true);
  });

  it("加入中のプラン変更はポータルを開く（Checkout の作り直しはしない＝二重課金防止）", async () => {
    h.createPortalAction.mockResolvedValue({ ok: true, url: "https://stripe.test/portal" });
    await renderSettings("next");

    fireEvent.click(screen.getByRole("button", { name: "プラン変更" }));
    fireEvent.click(planCardButton("Pro"));

    await waitFor(() =>
      expect(h.createPortalAction).toHaveBeenCalledWith({
        returnUrl: `${window.location.origin}/settings`,
      }),
    );
    await waitFor(() => expect(redirectTo).toHaveBeenCalledWith("https://stripe.test/portal"));
    expect(h.createCheckoutAction).not.toHaveBeenCalled();
  });

  it("ポータルが開けない（404）と案内文言を出し遷移しない", async () => {
    h.createPortalAction.mockResolvedValue({ ok: false, status: 404 });
    await renderSettings("next");

    fireEvent.click(screen.getByRole("button", { name: "プラン変更" }));
    fireEvent.click(planCardButton("Pro"));

    expect(await screen.findByText("加入中のプランが見つかりませんでした")).toBeTruthy();
    expect(redirectTo).not.toHaveBeenCalled();
  });
});

describe("SettingsShell: 未ログイン", () => {
  it("ログイン導線を出し、料金プラン（購入導線）は表示しない", async () => {
    stubMe(null);
    render(
      <AuthProvider>
        <SettingsShell />
      </AuthProvider>,
    );

    expect(await screen.findByText(/設定を開くには/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "プラン変更" })).toBeNull();
  });
});
