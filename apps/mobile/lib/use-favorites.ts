// お気に入り（★）。**サーバー保存**（アカウント紐付け。[決定] 2026-07-26。
// 端末ローカルだと端末を変えると消え、「お気に入りが多い順」も作れないため）。
//
// 重ね合わせの規則（apply / toggle / ロールバック）は @rigel/ui の純関数に置き、
// ここは「保存先が Bearer トークンの API であること」と「旧 SecureStore からの移行」だけを持つ
// （web の同名フックと芯を共有する）。

import type { FavoriteTargetType } from "@rigel/client";
import {
  applyFavoriteOverrides,
  rollbackFavoriteOverride,
  toggleFavoriteOverride,
  type FavoriteCard,
  type FavoriteOverrides,
} from "@rigel/ui";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { setFavorite } from "./api";
import { useAuth } from "./auth";

/** 端末ローカル時代（〜2026-07-26）の保存キー。ログイン後にサーバーへ移してから消す。 */
const LEGACY_KEY = "rigel.favs";
/** 移行で叩く上限（壊れた/膨らんだ保存値で大量リクエストを出さない）。 */
const LEGACY_MIGRATE_MAX = 50;

export type { FavoriteCard } from "@rigel/ui";

/** 既にサーバーへ移し終えたか（アプリ起動につき1回だけ試す。タブを跨いで多重に叩かない）。 */
let legacyMigrated = false;

/** テスト専用: 上のフラグを戻す。jest.resetModules で読み直すと React が二重になり
 *  「Invalid hook call」になるため、フラグだけをここで初期化できるようにしている。 */
export function resetFavoriteMigrationForTest(): void {
  legacyMigrated = false;
}

export function useFavorites() {
  const { token } = useAuth();
  const [overrides, setOverrides] = useState<FavoriteOverrides>(new Map());
  const [error, setError] = useState<string | null>(null);

  // 旧・端末ローカルのお気に入りをサーバーへ移す（ログイン中の初回のみ）。
  // 種別（半荘/何切る）を持っていなかったので両方に試し、見えないものは 404 で黙って捨てる。
  useEffect(() => {
    if (!token || legacyMigrated) return;
    legacyMigrated = true;
    void (async () => {
      const raw = await SecureStore.getItemAsync(LEGACY_KEY).catch(() => null);
      if (!raw) return;
      let ids: string[] = [];
      try {
        ids = (JSON.parse(raw) as string[]).slice(0, LEGACY_MIGRATE_MAX);
      } catch {
        // 壊れている場合も残す意味は無い（下で消す）。
      }
      for (const id of ids) {
        for (const type of ["game", "problem"] as const) {
          await setFavorite(token, type, id, true).catch(() => undefined);
        }
      }
      await SecureStore.deleteItemAsync(LEGACY_KEY).catch(() => undefined);
    })();
  }, [token]);

  /** カード配列に、この画面での操作を反映して返す（絞り込み・並べ替えはこの結果の上で行う）。 */
  const apply = useCallback(
    <T extends FavoriteCard>(cards: readonly T[]): T[] => applyFavoriteOverrides(cards, overrides),
    [overrides],
  );

  /** 付け外し（楽観更新。サーバーが失敗したら元に戻す）。未ログインは何もしない。 */
  const toggle = useCallback(
    (targetType: FavoriteTargetType, card: FavoriteCard) => {
      if (!token) {
        setError("お気に入りにはサインインが必要です。");
        return;
      }
      setError(null);
      setOverrides((prev) => {
        const before = prev.get(card.id);
        const next = toggleFavoriteOverride(prev, card);
        void setFavorite(token, targetType, card.id, next.get(card.id)!.faved)
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
    },
    [token],
  );

  return { apply, toggle, error };
}
