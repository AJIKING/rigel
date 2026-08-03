"use client";

// 解析ジョブのグローバル追従（web 版。mobile の AnalysisJobProvider を移植。
// docs/plans/web-mobile-parity.md Phase B）。
//   - ポーリングを一本で持つ（画面遷移・モーダルを閉じても進行が生きる）
//   - リロード・タブ復帰でも localStorage から復元する（別ユーザーの残骸は破棄）
//   - 終端（done/failed）やタイムアウトで settledCount を増やし、一覧に refetch させる
//   - 進行中は start を false で拒否（「解析はひとつずつ」。202 の後に断ると
//     サーバー側では課金・キュー投入が済んでいるため、送信前ガードに使う）

import { pollAnalysisOutcome } from "@rigel/ui";
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
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingAnalysis>;
    if (typeof v.jobId !== "string" || typeof v.startedAt !== "number") return null;
    return v as PendingAnalysis;
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
    setBusy(false);
    if (outcome.kind === "cancelled") return;
    clearPending();
    // done/failed はサーバーのバッジに反映済み。timeout もジョブ自体は進んでいるため、
    // いずれも一覧を再取得させて最新状態を見せる。
    setSettledCount((n) => n + 1);
  }, []);

  const start = useCallback(
    (pending: PendingAnalysis): boolean => {
      if (polling.current) return false;
      // 同期的に予約して、二連打の両方がガードを抜けるのを防ぐ。
      polling.current = true;
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

  // リロード・再訪の復元（ユーザーが確定したら一度だけ）。別ユーザーの残骸は掃除。
  const restored = useRef(false);
  useEffect(() => {
    if (!user || restored.current) return;
    restored.current = true;
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
      if (e.newValue && !polling.current) setBusy(true);
      if (!e.newValue && !polling.current) setBusy(false);
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
