// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-2 案B「送信したら一覧へ」）。
// ポーリングは画面ではなくこの Provider が一本で持つ:
//   - 画面遷移・アプリの開き直しでも進行が生きる（マウント時に SecureStore から復元）
//   - 二重ポーリングが構造的に起きない（進行中の start は false で拒否＝保存枠を潰さない）
//   - サインアウトでポーリングを中断し（shouldStop）、カードを消す。保存記録は userId 付きで
//     残し、同じユーザーの再ログインでだけ復元する（別アカウントに化けて出さない）
// done はカードを消して completedCount を増やし、一覧が refetch する（実カードが現れる）。

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
  /** 202 で受け取ったジョブを永続化してポーリングを開始する（撮影画面から）。
   *  進行中のジョブがあるときは開始せず false を返す（解析はひとつずつ）。 */
  start: (pending: PendingAnalysis) => Promise<boolean>;
  /** failed / timeout カードを閉じる。 */
  dismiss: () => void;
}

// Provider の外（未配線の画面・テスト）では不活性な既定値（App ルートで必ず配る）。
const INERT: AnalysisJobContextValue = {
  card: null,
  completedCount: 0,
  start: () => Promise.resolve(false),
  dismiss: () => {},
};

const AnalysisJobContext = createContext<AnalysisJobContextValue>(INERT);

export function AnalysisJobProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [card, setCard] = useState<AnalysisCard | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const polling = useRef(false);

  // ポーリングのループ内から「今の」セッションを見るための参照（クロージャに固定させない）。
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const userRef = useRef(user);
  userRef.current = user;

  const track = useCallback(async (pending: PendingAnalysis) => {
    const myToken = tokenRef.current;
    if (!myToken || polling.current) return;
    polling.current = true;
    setCard({ kind: "processing", ...(pending.seq !== undefined ? { seq: pending.seq } : {}) });
    // サインアウト（トークンが変わった）ら次の周期で中断する。
    const outcome = await pollAnalysisJob(myToken, pending, undefined, () => {
      return tokenRef.current !== myToken;
    });
    polling.current = false;
    if (outcome.kind === "cancelled") {
      // 中断: カードだけ消す。記録は残す（同じユーザーの再ログインで復元される）。
      setCard(null);
      return;
    }
    await clearPendingAnalysis();
    if (outcome.kind === "done") {
      setCard(null);
      setCompletedCount((n) => n + 1);
    } else if (outcome.kind === "failed") {
      setCard({ kind: "failed", message: outcome.message });
    } else {
      setCard({ kind: "timeout" });
    }
  }, []);

  const start = useCallback(
    async (pending: PendingAnalysis) => {
      // 解析はひとつずつ（2件目で SecureStore の枠を潰すと1件目が行方不明になる）。
      if (polling.current) return false;
      const withUser: PendingAnalysis = {
        ...pending,
        ...(userRef.current?.id ? { userId: userRef.current.id } : {}),
      };
      await savePendingAnalysis(withUser);
      void track(withUser); // ポーリングは待たせない（呼び出し側はすぐ画面遷移する）
      return true;
    },
    [track],
  );

  // セッション遷移: サインアウトでカードを消す（ポーリングは shouldStop が止める）。
  // 新しいトークンでは復元をやり直せるようフラグを戻す。
  const restored = useRef(false);
  const prevToken = useRef<string | null>(null);
  useEffect(() => {
    if (prevToken.current && !token) setCard(null);
    if (token && token !== prevToken.current) restored.current = false;
    prevToken.current = token;
  }, [token]);

  // 開き直しの復元（トークンが揃ったら一度だけ）。別ユーザーの残骸は復元せず掃除する。
  useEffect(() => {
    if (!token || restored.current) return;
    restored.current = true;
    void loadPendingAnalysis().then((pending) => {
      if (!pending) return;
      const uid = userRef.current?.id;
      if (pending.userId && uid && pending.userId !== uid) {
        void clearPendingAnalysis();
        return;
      }
      void track(pending);
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
