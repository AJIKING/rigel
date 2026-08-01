// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-2 案B「送信したら一覧へ」）。
// ポーリングは画面ではなくこの Provider が一本で持つ:
//   - 画面遷移・アプリの開き直しでも進行が生きる（マウント時に SecureStore から復元）
//   - 二重ポーリングが構造的に起きない
// カード状態は牌譜一覧（MyListScreen）の先頭に表示される。done はカードを消して
// completedCount を増やし、一覧が refetch する（実カードが現れる）。

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  clearPendingAnalysis,
  loadPendingAnalysis,
  pollAnalysisJob,
  savePendingAnalysis,
  type PendingAnalysis,
} from "./analysis-job";
import { useAuth } from "./auth";

export type AnalysisCard =
  { kind: "processing"; seq?: number } | { kind: "failed"; message: string } | { kind: "timeout" };

interface AnalysisJobContextValue {
  /** 一覧に出すカード（null = 出さない）。 */
  card: AnalysisCard | null;
  /** 完了のたびに増える（一覧の refetch トリガ）。 */
  completedCount: number;
  /** 202 で受け取ったジョブを永続化してポーリングを開始する（撮影画面から）。 */
  start: (pending: PendingAnalysis) => Promise<void>;
  /** failed / timeout カードを閉じる。 */
  dismiss: () => void;
}

// Provider の外（未配線の画面・テスト）では不活性な既定値（App ルートで必ず配る）。
const INERT: AnalysisJobContextValue = {
  card: null,
  completedCount: 0,
  start: () => Promise.resolve(),
  dismiss: () => {},
};

const AnalysisJobContext = createContext<AnalysisJobContextValue>(INERT);

export function AnalysisJobProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [card, setCard] = useState<AnalysisCard | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const polling = useRef(false);

  const track = useCallback(
    async (pending: PendingAnalysis) => {
      if (!token || polling.current) return;
      polling.current = true;
      setCard({ kind: "processing", ...(pending.seq !== undefined ? { seq: pending.seq } : {}) });
      const outcome = await pollAnalysisJob(token, pending);
      await clearPendingAnalysis();
      polling.current = false;
      if (outcome.kind === "done") {
        setCard(null);
        setCompletedCount((n) => n + 1);
      } else if (outcome.kind === "failed") {
        setCard({ kind: "failed", message: outcome.message });
      } else {
        setCard({ kind: "timeout" });
      }
    },
    [token],
  );

  const start = useCallback(
    async (pending: PendingAnalysis) => {
      await savePendingAnalysis(pending);
      void track(pending); // ポーリングは待たせない（呼び出し側はすぐ画面遷移する）
    },
    [track],
  );

  // 開き直しの復元（トークンが揃ったら一度だけ）。
  const restored = useRef(false);
  useEffect(() => {
    if (!token || restored.current) return;
    restored.current = true;
    void loadPendingAnalysis().then((pending) => {
      if (pending) void track(pending);
    });
  }, [token, track]);

  const dismiss = useCallback(() => setCard(null), []);

  return (
    <AnalysisJobContext.Provider value={{ card, completedCount, start, dismiss }}>
      {children}
    </AnalysisJobContext.Provider>
  );
}

export function useAnalysisJob(): AnalysisJobContextValue {
  return useContext(AnalysisJobContext);
}
