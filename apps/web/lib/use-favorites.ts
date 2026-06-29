"use client";

import { useCallback, useEffect, useState } from "react";

const FAV_KEY = "rigel.favs";

/**
 * お気に入り（端末ローカル・localStorage）。一覧画面とユーザーページで共有。
 * サーバー側には保存しない（ブラウザごと）。
 */
export function useFavorites() {
  const [favs, setFavs] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavs(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* localStorage 不可でも無視 */
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return { favs, toggle };
}
