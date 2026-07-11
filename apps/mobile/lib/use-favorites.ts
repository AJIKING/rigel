// お気に入り（端末ローカル・SecureStore 永続化）。サーバには保存しない（端末ごと）。
// web の lib/use-favorites（localStorage）と同じ API（favs / toggle）。
// お気に入り数の集計（人気順）はサーバ側の永続化が必要なため未対応（設計 9章 TODO 参照）。

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

const KEY = "rigel.favs";

export function useFavorites(): { favs: Set<string>; toggle: (id: string) => void } {
  const [favs, setFavs] = useState<Set<string>>(new Set());

  useEffect(() => {
    void SecureStore.getItemAsync(KEY).then((raw) => {
      if (!raw) return;
      try {
        setFavs(new Set(JSON.parse(raw) as string[]));
      } catch {
        // 壊れた保存値は捨てる（お気に入りは端末ローカルの補助機能）。
      }
    });
  }, []);

  // web 版（lib/use-favorites）と同型。保存は冪等なので updater 内で行って問題ない。
  const toggle = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void SecureStore.setItemAsync(KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  return { favs, toggle };
}
