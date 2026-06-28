"use client";

import { useEffect, useState } from "react";
import { getGame, getGames, type Game, type GameDetail } from "./api";
import { useAuth } from "./auth-context";
import { sampleGameDetail, sampleGames } from "./sample-data";

interface GamesState {
  loading: boolean;
  games: Game[];
  /** 未ログインでサンプルを表示しているか。 */
  sample: boolean;
  error?: string;
}

/** 半荘一覧。ログイン時は API、未ログイン時はサンプル。 */
export function useGames(): GamesState {
  const { token, loading: authLoading } = useAuth();
  const [state, setState] = useState<GamesState>({ loading: true, games: [], sample: false });

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setState({ loading: false, games: sampleGames, sample: true });
      return;
    }
    let active = true;
    getGames(token)
      .then((games) => active && setState({ loading: false, games, sample: false }))
      .catch(
        () =>
          active &&
          setState({ loading: false, games: [], sample: false, error: "取得に失敗しました" }),
      );
    return () => {
      active = false;
    };
  }, [token, authLoading]);

  return state;
}

interface GameState {
  loading: boolean;
  detail: GameDetail | null;
  sample: boolean;
  error?: string;
}

/** 半荘詳細。ログイン時は API、未ログイン時はサンプル。 */
export function useGame(id: string): GameState {
  const { token, loading: authLoading } = useAuth();
  const [state, setState] = useState<GameState>({ loading: true, detail: null, sample: false });

  useEffect(() => {
    if (authLoading) return;
    if (!token) {
      setState({ loading: false, detail: sampleGameDetail, sample: true });
      return;
    }
    let active = true;
    getGame(token, id)
      .then((detail) => active && setState({ loading: false, detail, sample: false }))
      .catch(
        () =>
          active &&
          setState({ loading: false, detail: null, sample: false, error: "取得に失敗しました" }),
      );
    return () => {
      active = false;
    };
  }, [token, authLoading, id]);

  return state;
}
