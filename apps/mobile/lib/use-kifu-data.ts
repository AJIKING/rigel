import { LIST_LOAD_ERROR_MESSAGE } from "@rigel/ui";
import { useCallback, useEffect, useState } from "react";
import {
  getGame,
  getMyGames,
  getPublicGames,
  type GameDetail,
  type MyGameCard,
  type PublicGameCard,
} from "./api";
import { useAuth } from "./auth";
import { sampleGameDetail, sampleMyGames } from "./sample-data";

interface ResourceState<T> {
  loading: boolean;
  data: T;
  /** 未ログインでサンプルを表示しているか。 */
  sample: boolean;
  error?: string;
}

/** 認証付きで取得するデータの共通フック（未ログインはサンプル、失敗時は empty）。
 *  refetch() で静かに再取得できる（loading は初回のみ＝画面フォーカス時の更新でちらつかせない）。 */
function useAuthedData<T>(
  fetcher: (token: string) => Promise<T>,
  fallback: { sample: T; empty: T },
  key: string,
): ResourceState<T> & { refetch: () => void } {
  const { token, loading: authLoading } = useAuth();
  const [state, setState] = useState<ResourceState<T>>({
    loading: true,
    data: fallback.empty,
    sample: false,
  });
  // refetch はこのカウンタを進めて effect を再実行させる。
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setState({ loading: false, data: fallback.sample, sample: true });
      return;
    }
    let active = true;
    fetcher(token)
      .then((data) => {
        if (active) setState({ loading: false, data, sample: false });
      })
      .catch(() => {
        if (active) {
          setState({
            loading: false,
            data: fallback.empty,
            sample: false,
            error: LIST_LOAD_ERROR_MESSAGE,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [token, authLoading, key, tick]);

  return { ...state, refetch };
}

export function useMyGames() {
  const s = useAuthedData(
    getMyGames,
    { sample: sampleMyGames, empty: [] as MyGameCard[] },
    "my-games",
  );
  return {
    loading: s.loading,
    games: s.data,
    sample: s.sample,
    error: s.error,
    refetch: s.refetch,
  };
}

/**
 * 公開牌譜フィード（認証不要・全ユーザーの公開半荘）。
 * **通信失敗時にサンプルを出さない**（[決定] 2026-07-26）: 架空の牌譜を本物の一覧として
 * 見せると、利用者は「まだ誰も投稿していない」と受け取り、失敗に気づけないし、
 * 開いても存在しない半荘に飛ぶ。失敗は失敗として伝える。
 */
export function usePublicGames() {
  const [state, setState] = useState<{
    loading: boolean;
    games: PublicGameCard[];
    sample: boolean;
    error?: string;
  }>({ loading: true, games: [], sample: false });

  useEffect(() => {
    let active = true;
    getPublicGames()
      .then((games) => {
        if (active) setState({ loading: false, games, sample: false });
      })
      .catch(() => {
        if (active) {
          setState({ loading: false, games: [], sample: false, error: LIST_LOAD_ERROR_MESSAGE });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

export function useGame(id: string) {
  const s = useAuthedData(
    (token) => getGame(token, id),
    { sample: sampleGameDetail, empty: null as GameDetail | null },
    id,
  );
  return {
    loading: s.loading,
    detail: s.data,
    sample: s.sample,
    error: s.error,
    refetch: s.refetch,
  };
}
