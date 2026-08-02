// 解析ジョブのグローバル状態（docs/plans/async-analysis.md 8-3 半荘先行作成）。
// 表示の真実源はサーバー（一覧/詳細 DTO の analysisStatus バッジ）。この Provider は
//   - ジョブのポーリングを一本で持つ（画面遷移・開き直しでも進行が生きる。復元も担う）
//   - 終端（done/failed）やタイムアウトで settledCount を増やし、一覧に refetch させる
//   - サインアウトでポーリングを中断（shouldStop）。保存記録は userId 付きで残し、
//     同じユーザーの再ログインでだけ復元する（別アカウントに化けて出さない）
//   - 進行中の start は false で拒否（解析はひとつずつ＝保存枠を潰さない）

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

interface AnalysisJobContextValue {
  /** ジョブが終端（done/failed）やタイムアウトに達するたび増える（一覧の refetch トリガ）。 */
  settledCount: number;
  /** 202 で受け取ったジョブを永続化してポーリングを開始する（撮影画面から）。
   *  進行中のジョブがあるときは開始せず false を返す（解析はひとつずつ）。 */
  start: (pending: PendingAnalysis) => Promise<boolean>;
}

// Provider の外（未配線の画面・テスト）では不活性な既定値（App ルートで必ず配る）。
const INERT: AnalysisJobContextValue = {
  settledCount: 0,
  start: () => Promise.resolve(false),
};

const AnalysisJobContext = createContext<AnalysisJobContextValue>(INERT);

export function AnalysisJobProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [settledCount, setSettledCount] = useState(0);
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
    // サインアウト（トークンが変わった）ら次の周期で中断する。
    const outcome = await pollAnalysisJob(myToken, pending, undefined, () => {
      return tokenRef.current !== myToken;
    });
    polling.current = false;
    if (outcome.kind === "cancelled") return; // 記録は残す（同じユーザーの再ログインで復元）
    await clearPendingAnalysis();
    // done/failed はサーバーのバッジに反映済み。timeout もジョブ自体は進んでいるため、
    // いずれも一覧を再取得させて最新状態（実カード or 解析中/失敗バッジ）を見せる。
    setSettledCount((n) => n + 1);
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

  // セッション遷移: 新しいトークンでは復元をやり直せるようフラグを戻す。
  const restored = useRef(false);
  const prevToken = useRef<string | null>(null);
  useEffect(() => {
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

  return (
    <AnalysisJobContext.Provider value={{ settledCount, start }}>
      {children}
    </AnalysisJobContext.Provider>
  );
}

export function useAnalysisJob(): AnalysisJobContextValue {
  return useContext(AnalysisJobContext);
}
