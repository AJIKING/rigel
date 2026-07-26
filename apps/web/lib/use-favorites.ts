"use client";

import type { FavoriteTargetType } from "@rigel/client";
import {
  applyFavoriteOverrides,
  rollbackFavoriteOverride,
  toggleFavoriteOverride,
  type FavoriteCard,
  type FavoriteOverrides,
} from "@rigel/ui";
import { useCallback, useEffect, useState } from "react";
import { setFavoriteAction } from "../app/actions";

/** 端末ローカル時代（〜2026-07-26）のお気に入りキー。ログイン後にサーバーへ移してから消す。 */
const LEGACY_KEY = "rigel.favs";
/** 移行で叩く上限（壊れた/膨らんだ localStorage で大量リクエストを出さない）。 */
const LEGACY_MIGRATE_MAX = 50;

export type { FavoriteCard } from "@rigel/ui";

/** 既にサーバーへ移し終えたか（1ページロードにつき1回だけ試す）。 */
let legacyMigrated = false;

/**
 * お気に入り（★）。**サーバー保存**（アカウント紐付け。[決定] 2026-07-26。
 * 端末ローカルだと端末を変えると消え、「お気に入りが多い順」も作れないため）。
 *
 * 重ね合わせの規則（apply / toggle / ロールバック）は @rigel/ui の純関数に置き、
 * ここは「保存先が Server Action であること」と「旧 localStorage からの移行」だけを持つ
 * （mobile の同名フックと芯を共有する）。
 */
export function useFavorites() {
  const [overrides, setOverrides] = useState<FavoriteOverrides>(new Map());
  const [error, setError] = useState<string | null>(null);

  // 旧・端末ローカルのお気に入りをサーバーへ移す（初回のみ）。
  // 種別（半荘/何切る）を持っていなかったので両方に試し、見えないものは 404 で黙って捨てる。
  useEffect(() => {
    if (legacyMigrated) return;
    legacyMigrated = true;
    let ids: string[];
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (!raw) return;
      ids = (JSON.parse(raw) as string[]).slice(0, LEGACY_MIGRATE_MAX);
    } catch {
      // 壊れている場合も残しておく意味は無いので消す。
      localStorage.removeItem(LEGACY_KEY);
      return;
    }
    void (async () => {
      for (const id of ids) {
        for (const type of ["game", "problem"] as const) {
          await setFavoriteAction(type, id, true).catch(() => undefined);
        }
      }
      localStorage.removeItem(LEGACY_KEY);
    })();
  }, []);

  /** カード配列に、この画面での操作を反映して返す（絞り込み・並べ替えはこの結果の上で行う）。 */
  const apply = useCallback(
    <T extends FavoriteCard>(cards: readonly T[]): T[] => applyFavoriteOverrides(cards, overrides),
    [overrides],
  );

  /** 付け外し（楽観更新。サーバーが失敗したら元に戻す）。 */
  const toggle = useCallback((targetType: FavoriteTargetType, card: FavoriteCard) => {
    setError(null);
    setOverrides((prev) => {
      const before = prev.get(card.id);
      const next = toggleFavoriteOverride(prev, card);
      void setFavoriteAction(targetType, card.id, next.get(card.id)!.faved)
        .then((res) => {
          if (res.ok) return;
          throw new Error("failed");
        })
        .catch(() => {
          setOverrides((cur) => rollbackFavoriteOverride(cur, card.id, before));
          setError("お気に入りを更新できませんでした。");
        });
      return next;
    });
  }, []);

  return { apply, toggle, error };
}
