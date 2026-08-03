"use client";

// 解析ジョブのグローバル追従（web 版。mobile の AnalysisJobProvider を移植。
// docs/plans/web-mobile-parity.md Phase B）。
//   - ポーリングを一本で持つ（画面遷移・モーダルを閉じても進行が生きる）
//   - リロード・タブ復帰でも localStorage から復元する（別ユーザーの残骸は破棄）
//   - 終端（done/failed）やタイムアウトで settledCount を増やし、一覧に refetch させる
//   - 進行中は start を false で拒否（「解析はひとつずつ」。202 の後に断ると
//     サーバー側では課金・キュー投入が済んでいるため、送信前ガードに使う）

import { parsePendingAnalysis, pollAnalysisOutcome } from "@rigel/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAnalysisJobAction } from "../app/actions";
import { useAuth } from "./auth-context";

/** 追跡中の解析ジョブ（localStorage に永続化。リロードで復元する）。 */
export interface PendingAnalysis {
  jobId: string;
  startedAt: number;
  /** 送信したユーザー（別アカウントに化けて復元しないためのガード）。 */
  userId?: string;
}

const STORAGE_KEY = "rigel:pendingAnalysis";

function loadPending(): PendingAnalysis | null {
  try {
    // 検証（壊れた記録は捨てる）は @rigel/ui の parsePendingAnalysis（mobile と共通）。
    return parsePendingAnalysis(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function savePending(p: PendingAnalysis): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 容量・プライベートモード等で書けなくても追従自体は進める（復元だけ諦める）。
  }
}

function clearPending(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

interface AnalysisJobContextValue {
  /** ジョブが終端（done/failed）やタイムアウトに達するたび増える（一覧の refetch トリガ）。 */
  settledCount: number;
  /** ポーリング中のジョブがあるか。送信前ガードに使う。 */
  busy: boolean;
  /** 202 で受け取ったジョブを永続化してポーリングを開始する。進行中なら false（ひとつずつ）。 */
  start: (pending: PendingAnalysis) => boolean;
}

// Provider の外（未配線のテスト等）では不活性な既定値（layout で必ず配る）。
const INERT: AnalysisJobContextValue = { settledCount: 0, busy: false, start: () => false };

const AnalysisJobContext = createContext<AnalysisJobContextValue>(INERT);

export function AnalysisJobProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settledCount, setSettledCount] = useState(0);
  const [busy, setBusy] = useState(false);
  // busy のミラー（start の同期ガードで見る。state は同一ティック内の判定に使えない）。
  const busyRef = useRef(false);
  const polling = useRef(false);
  const userRef = useRef(user);
  userRef.current = user;
  // ページ破棄でポーリングを打ち切る（記録は残す＝次の訪問で復元）。
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const track = useCallback(async (pending: PendingAnalysis, claimed = false) => {
    if (!claimed) {
      if (polling.current) return;
      polling.current = true;
      busyRef.current = true;
      setBusy(true);
    }
    const outcome = await pollAnalysisOutcome(
      () => getAnalysisJobAction(pending.jobId),
      pending.startedAt,
      undefined,
      () => !alive.current,
    );
    polling.current = false;
    if (!alive.current) return; // ページ破棄。記録は残す（次の訪問で復元）
    busyRef.current = false;
    setBusy(false);
    if (outcome.kind === "cancelled") return;
    clearPending();
    // done/failed はサーバーのバッジに反映済み。timeout もジョブ自体は進んでいるため、
    // いずれも一覧を再取得させて最新状態を見せる。
    setSettledCount((n) => n + 1);
  }, []);

  const start = useCallback(
    (pending: PendingAnalysis): boolean => {
      // 「ひとつずつ」の不変条件は Provider 側で守る（呼び出し側ガードは案内表示のため）。
      // busyRef は他タブの進行（storage イベント）も含む。
      if (polling.current || busyRef.current) return false;
      // 同期的に予約して、二連打の両方がガードを抜けるのを防ぐ。
      polling.current = true;
      busyRef.current = true;
      setBusy(true);
      const withUser: PendingAnalysis = {
        ...pending,
        ...(userRef.current?.id ? { userId: userRef.current.id } : {}),
      };
      savePending(withUser);
      void track(withUser, true);
      return true;
    },
    [track],
  );

  // リロード・再訪の復元（ユーザーごとに一度）。別ユーザーの残骸は掃除。
  // ユーザーが変わったら復元をやり直す（mobile と同じ意味論。品質パス 2026-08-03）。
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || restoredFor.current === user.id) return;
    restoredFor.current = user.id;
    const pending = loadPending();
    if (!pending) return;
    if (pending.userId && pending.userId !== user.id) {
      clearPending();
      return;
    }
    void track(pending);
  }, [user, track]);

  // 別タブが解析を開始/終了したら busy を同調させる（厳密なロックではない。
  // 最終ガードはサーバーの 409 game_analyzing）。
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (polling.current) return; // 自タブ進行中は自分の状態が優先
      busyRef.current = !!e.newValue;
      setBusy(!!e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <AnalysisJobContext.Provider value={{ settledCount, busy, start }}>
      {children}
    </AnalysisJobContext.Provider>
  );
}

export function useAnalysisJob(): AnalysisJobContextValue {
  return useContext(AnalysisJobContext);
}
