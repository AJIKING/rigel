// 元写真ビュー（恒久保存・所有者のみ。photo-retention.md）。
// BFF プロキシ（/api/photos/…）の URL で <img> を組むこと、
// 空状態・所有者限定の注記が出ることを固定する。

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ getGamePhotosAction: vi.fn() }));
vi.mock("../../app/actions", () => h);

import { GamePhotosModal } from "./GamePhotosModal";

describe("GamePhotosModal", () => {
  it("写真を BFF プロキシの URL で表示し、所有者限定の注記を出す", async () => {
    h.getGamePhotosAction.mockResolvedValue([
      { jobId: "j1", kind: "river" },
      { jobId: "j1", kind: "hand_bottom" },
    ]);
    render(<GamePhotosModal gameId="g1" onClose={() => {}} />);

    const river = await screen.findByAltText("卓全景（河）");
    expect(river.getAttribute("src")).toBe("/api/photos/g1/j1/river");
    expect(screen.getByAltText("手牌：手前")).toBeTruthy();
    expect(screen.getByText(/あなたにだけ表示されます/)).toBeTruthy();
  });

  it("写真が無い半荘には空状態の案内を出す", async () => {
    h.getGamePhotosAction.mockResolvedValue([]);
    render(<GamePhotosModal gameId="g1" onClose={() => {}} />);

    expect(await screen.findByText(/元写真はありません/)).toBeTruthy();
  });
});
