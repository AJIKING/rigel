import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROMO_SHOTS } from "../../../lib/promo-shots";

// next/navigation をスタブ（notFound は本物同様に throw で描画を止める）。
const nav = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound: nav.notFound }));

import DevPromoPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
  nav.notFound.mockClear();
});

describe("/dev/promo（ストア用プロモ画像のフィクスチャ）", () => {
  it("NODE_ENV=production では notFound になる（本番には出さない）", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => render(<DevPromoPage />)).toThrowError("NEXT_NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
  });

  it("マニフェストの全フレームが data-shot 付き・指定 CSS 寸法で描画される", () => {
    const { container } = render(<DevPromoPage />);
    for (const shot of PROMO_SHOTS) {
      const el = container.querySelector<HTMLElement>(`[data-shot="${shot.id}"]`);
      expect(el, `frame ${shot.id} が存在する`).toBeTruthy();
      // 撮影（element screenshot）の出力ピクセルはこの寸法×dsf。inline style で固定する。
      expect(el!.style.width).toBe(`${shot.cssWidth}px`);
      expect(el!.style.height).toBe(`${shot.cssHeight}px`);
    }
  });

  it("ヒーローコピー（句点はここだけ）は iOS/Play/feature の3面に出る", () => {
    render(<DevPromoPage />);
    // capture フレーム（iOS・Play）+ フィーチャーグラフィックの計3箇所。
    // 掲載順はクイズ・何切るが先頭（[決定] 2026-07-31。promo-shots.ts の PROMO_FRAMES が正）。
    // 改行する見出しは行末の読点を持たない（[決定] 2026-07-31。1行の feature のみ読点あり）。
    expect(screen.getAllByText(/麻雀の記録を/)).toHaveLength(3);
    expect(screen.getAllByText(/麻雀の記録を、/)).toHaveLength(1);
  });

  it("訴求コピー（みんなで何切る・画像は保存しない）が含まれる", () => {
    render(<DevPromoPage />);
    // 共有: 送った相手も牌譜が見れて何切るが解ける — iOS / Play の2枚。
    expect(screen.getAllByText(/みんなで何切る/).length).toBeGreaterThanOrEqual(2);
    // 画像の保存/削除には言及しない（訴求から外す。[決定] 2026-08-02 オーナー）。
    expect(screen.queryByText(/画像は保存|自動削除/)).toBeNull();
  });

  it("盤面は実部品（ViewBoard）で描画される（capture × iOS/Play + feature）", () => {
    const { container } = render(<DevPromoPage />);
    // ViewBoard は席ごとに data-seat を持つ。capture 2面 + feature 1面（review は capture に統合済み）。
    expect(container.querySelectorAll('[data-seat="bottom"]').length).toBe(3);
  });
});
