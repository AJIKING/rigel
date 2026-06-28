import { useEffect, useState } from "react";
import { getGame, getGames, type Game, type GameDetail } from "./api";
import { useAuth } from "./auth";
import { sampleGameDetail, sampleGames } from "./sample-data";

interface ResourceState<T> {
  loading: boolean;
  data: T;
  /** 未ログインでサンプルを表示しているか。 */
  sample: boolean;
  error?: string;
}

/** 認証付きで取得するデータの共通フック（未ログインはサンプル、失敗時は empty）。 */
function useAuthedData<T>(
  fetcher: (token: string) => Promise<T>,
  fallback: { sample: T; empty: T },
  key: string,
): ResourceState<T> {
  const { token, loading: authLoading } = useAuth();
  const [state, setState] = useState<ResourceState<T>>({
    loading: true,
    data: fallback.empty,
    sample: false,
  });

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
            error: "取得に失敗しました",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [token, authLoading, key]);

  return state;
}

export function useGames() {
  const s = useAuthedData(getGames, { sample: sampleGames, empty: [] as Game[] }, "games");
  return { loading: s.loading, games: s.data, sample: s.sample, error: s.error };
}

export function useGame(id: string) {
  const s = useAuthedData(
    (token) => getGame(token, id),
    { sample: sampleGameDetail, empty: null as GameDetail | null },
    id,
  );
  return { loading: s.loading, detail: s.data, sample: s.sample, error: s.error };
}
