"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * 760px 盤面を親要素の幅に収めるスケールを返す（盤面エディタ・閲覧ビューア共通）。
 * offset は左右の余白、deps は再計算トリガ（全画面・サイド開閉など）。
 */
export function useBoardScale(
  ref: RefObject<HTMLElement | null>,
  offset = 48,
  deps: unknown[] = [],
): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => {
      const avail = (ref.current?.clientWidth ?? 808) - offset;
      setScale(Math.min(1, avail / 768));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // offset / deps（全画面・サイド開閉など）の変化でも再計算する。
  }, [ref, offset, ...deps]);
  return scale;
}
