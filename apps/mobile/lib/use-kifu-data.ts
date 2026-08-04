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
import { useLoadMore } from "./use-load-more";

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

/** マイ牌譜一覧（要ログイン・カーソル方式）。refetch は先頭ページへ戻す
 *  （追加読み込み済みの範囲は畳まれる。解析完了・削除の反映を優先）。 */
export function useMyGames() {
  const { token, loading: authLoading } = useAuth();
  const [state, setState] = useState<{
    loading: boolean;
    games: MyGameCard[];
    sample: boolean;
    error?: string;
  }>({ loading: true, games: [], sample: false });
  // refetch はこのカウンタを進めて effect を再実行させる。
  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);
  // 追加読み込みの機構（多重発火・reset 競合のガード込み）は useLoadMore（全一覧共通）。
  const { loadingMore, moreFailed, loadMore, reset, activeRef } = useLoadMore(
    useCallback(
      (cursor: string) => (token ? getMyGames(token, cursor) : Promise.resolve(null)),
      [token],
    ),
    useCallback(
      (page: { items: MyGameCard[]; nextCursor: string | null }) =>
        setState((prev) => ({ ...prev, games: [...prev.games, ...page.items] })),
      [],
    ),
  );

  useEffect(() => {
    activeRef.current = true;
    if (authLoading) return;
    if (!token) {
      setState({ loading: false, games: sampleMyGames, sample: true });
      reset(null);
      return;
    }
    getMyGames(token)
      .then((page) => {
        if (activeRef.current) {
          setState({ loading: false, games: page.items, sample: false });
          reset(page.nextCursor);
        }
      })
      .catch(() => {
        if (activeRef.current) {
          // 既に一覧が出ているなら消さない（refetch 失敗で画面を白紙に戻さない）。
          setState((prev) => ({
            loading: false,
            games: prev.games,
            sample: false,
            error: LIST_LOAD_ERROR_MESSAGE,
          }));
        }
      });
    return () => {
      activeRef.current = false;
    };
  }, [token, authLoading, tick, reset, activeRef]);

  return { ...state, refetch, loadMore, loadingMore, moreFailed };
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
  // 追加読み込みの機構（多重発火・reset 競合のガード込み）は useLoadMore（全一覧共通）。
  const { loadingMore, moreFailed, loadMore, reset, activeRef } = useLoadMore(
    getPublicGames,
    useCallback(
      (page: { items: PublicGameCard[]; nextCursor: string | null }) =>
        setState((prev) => ({ ...prev, games: [...prev.games, ...page.items] })),
      [],
    ),
  );

  useEffect(() => {
    activeRef.current = true;
    getPublicGames()
      .then((page) => {
        if (activeRef.current) {
          setState({ loading: false, games: page.items, sample: false });
          reset(page.nextCursor);
        }
      })
      .catch(() => {
        if (activeRef.current) {
          setState({ loading: false, games: [], sample: false, error: LIST_LOAD_ERROR_MESSAGE });
        }
      });
    return () => {
      activeRef.current = false;
    };
  }, [reset, activeRef]);

  return { ...state, loadMore, loadingMore, moreFailed };
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
