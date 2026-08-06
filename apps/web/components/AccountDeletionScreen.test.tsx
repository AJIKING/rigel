// アカウント削除の案内ページ（Google Play の「アカウント削除リクエスト用リンク」要件）。
// 審査要件の骨子＝アプリ外（ウェブ）からの削除手段・削除される範囲・有料プラン中の扱いが
// 明記されていることを固定する。

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountDeletionScreen } from "./AccountDeletionScreen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));

describe("AccountDeletionScreen（/account-deletion）", () => {
  it("アプリ外（ウェブ）からの削除手順と問い合わせ先を明記する（アプリ削除済みでも辿れる要件）", () => {
    render(<AccountDeletionScreen />);
    expect(screen.getByRole("heading", { name: "アカウントの削除" })).toBeTruthy();
    expect(screen.getByText(/ウェブから:/)).toBeTruthy();
    expect(screen.getAllByText(/info@plaria\.co\.jp/).length).toBeGreaterThan(0);
  });

  it("削除される範囲（撮影画像・牌譜など）と有料プラン中は先に解約が必要な旨を明記する", () => {
    render(<AccountDeletionScreen />);
    expect(screen.getByText(/撮影画像/)).toBeTruthy();
    expect(screen.getByText(/先にプランの解約が必要/)).toBeTruthy();
    expect(screen.getByText(/自動では停止しません/)).toBeTruthy();
  });
});
