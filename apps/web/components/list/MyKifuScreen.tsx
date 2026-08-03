"use client";

import {
  analyzeErrorMessage,
  deleteConfirmText,
  planKifuLimits,
  sortMyList,
  DELETE_CONFIRM,
  LIST_LOAD_ERROR_MESSAGE,
  type MyListSortKey,
} from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { deleteGameAction, getMyGamesAction, retryAnalysisAction } from "../../app/actions";
import { type MyGameCard } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDateSlash } from "../../lib/format";
import { useAnalysisJob } from "../../lib/use-analysis-job";
import { useFavorites } from "../../lib/use-favorites";
import { AppHeader } from "../AppHeader";
import { GameCard } from "../GameCard";
import { MyPageTabs } from "../mypage/MyPageTabs";
import { MyListToolbar } from "./MyListToolbar";
import gc from "../game-card.module.css";
import s from "./kifu-list.module.css";

/** 公開状態フィルタ（お気に入りは独立トグルなのでここには入れない）。 */
const STATUS_OPTIONS = [
  { value: "all", label: "すべて" },
  { value: "pub", label: "公開" },
  { value: "priv", label: "非公開" },
] as const;

/**
 * マイページの牌譜タブ（/mypage・要ログイン・noindex）。
 *
 * 公開一覧（PublicKifuScreen）とは見せるものも操作も違うので分けている
 * （[決定] 2026-07-26。以前は1つの component が view prop で2画面を兼ねていた）。
 * こちらは検索エンジンに出さないので、取得はクライアントのままでよい
 * （未ログインでもログイン導線を出して画面を成立させたいため）。
 */
export function MyKifuScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<MyGameCard[] | null>(null);
  // 取得失敗を「0件」に化けさせない（空状態の案内を出すと通信失敗に気づけない）。
  const [loadFailed, setLoadFailed] = useState(false);

  // お気に入りはサーバー保存。カードが持つ viewerFaved/favoriteCount に、この画面での操作を重ねる。
  const { apply, toggle: toggleFav, error: favError } = useFavorites();
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<MyListSortKey>("new");
  const [favOnly, setFavOnly] = useState(false);
  const [q, setQ] = useState("");
  // 解析失敗カードの操作結果・案内（インライン表示。alert は使わない）。
  const [note, setNote] = useState<string | null>(null);

  /** もう一度解析（Phase 2）。202 で即「解析中」バッジへ。完了は Provider が追従する。 */
  async function onRetry(c: MyGameCard) {
    if (!c.analysisJobId) return;
    if (analysisBusy) {
      setNote("解析はひとつずつ実行できます。進行中の解析が終わってからお試しください。");
      return;
    }
    setNote(null);
    try {
      const r = await retryAnalysisAction(c.analysisJobId);
      if (r.ok) {
        startTracking({ jobId: r.jobId, startedAt: Date.now() });
        setGames(
          (prev) =>
            prev?.map((g) =>
              g.id === c.id ? { ...g, analysisStatus: "processing" as const } : g,
            ) ?? prev,
        );
      } else {
        setNote(analyzeErrorMessage(r.status, r.reason));
      }
    } catch {
      setNote("通信に失敗しました。");
    }
  }

  /** 0局の失敗半荘の削除（確認あり。文言は web/mobile 共通の DELETE_CONFIRM）。 */
  async function onDeleteFailed(c: MyGameCard) {
    if (!window.confirm(deleteConfirmText(DELETE_CONFIRM.game(c.title)))) return;
    setNote(null);
    try {
      const r = await deleteGameAction(c.id);
      if (r.ok) setGames((prev) => prev?.filter((g) => g.id !== c.id) ?? prev);
      else setNote("削除に失敗しました。");
    } catch {
      setNote("削除に失敗しました。");
    }
  }

  // 解析ジョブの追従（Phase B）: 終端（settledCount）で refetch する。
  const { settledCount, busy: analysisBusy, start: startTracking } = useAnalysisJob();
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setGames([]);
      return;
    }
    getMyGamesAction()
      .then(setGames)
      .catch(() => {
        // 既に一覧が出ているなら消さない（refetch 失敗で画面を白紙に戻さない）。
        setGames((cur) => cur ?? []);
        setLoadFailed(true);
      });
  }, [authLoading, user, settledCount]);

  // 解析中バッジがある間は 5 秒間隔で再取得（他端末・復元漏れの進行も拾う。
  // 何切る下書き一覧と同じ方式）。取得効果と分ける＝retry の楽観更新を即 refetch で潰さない。
  const hasProcessing = (games ?? []).some((c) => c.analysisStatus === "processing");
  useEffect(() => {
    if (!user || !hasProcessing) return;
    const timer = setInterval(() => {
      getMyGamesAction()
        .then(setGames)
        .catch(() => {
          // ポーリングの失敗は無視（次の周期・settledCount で回復する）。
        });
    }, 5000);
    return () => clearInterval(timer);
  }, [user, hasProcessing]);

  const view = useMemo(() => {
    let arr = apply(games ?? []);
    if (favOnly) arr = arr.filter((c) => c.viewerFaved);
    if (status === "pub") arr = arr.filter((c) => c.publicCount > 0);
    else if (status === "priv") arr = arr.filter((c) => c.publicCount === 0);
    if (q) arr = arr.filter((c) => c.title.includes(q));
    return sortMyList(arr, sort);
  }, [games, status, sort, favOnly, q, apply]);

  // 保存上限（半荘単位）の使用数。非公開(complete)と下書きは別枠（mobile と同じ算出）。
  const limits = planKifuLimits(user?.plan ?? "free");
  const draftUsed = (games ?? []).filter((c) => c.draftCount > 0).length;
  const privateUsed = (games ?? []).filter(
    (c) => c.kyokuCount - c.publicCount - c.draftCount > 0,
  ).length;
  const quotaText = (used: number, limit: number | null) =>
    limit === null ? `${used}（無制限）` : `${used} / ${limit}半荘`;

  return (
    <div className={`${s.shell} themeApp`}>
      <AppHeader active="mypage" />
      <main className={s.main}>
        <section>
          <MyPageTabs active="kifu" />
          <div className={s.profile}>
            <div className={s.stats}>
              <div className={s.stat}>
                <b>{games?.length ?? 0}</b>
                <span>牌譜</span>
              </div>
              <div className={s.stat}>
                <b>{(games ?? []).filter((c) => c.publicCount > 0).length}</b>
                <span>公開</span>
              </div>
              <div className={s.stat}>
                <b>{(games ?? []).reduce((n, c) => n + c.favoriteCount, 0)}</b>
                <span>お気に入りされた数</span>
              </div>
            </div>
            {/* 作成可能数と現在数（半荘単位。free=各5 / 有料=無制限）。mobile と同一表示。 */}
            {user ? (
              <p className={s.quota}>
                非公開 {quotaText(privateUsed, limits.private)}
                <span className={gc.sep}>·</span>
                下書き {quotaText(draftUsed, limits.draft)}
              </p>
            ) : null}
          </div>

          {favError && <p className={s.favError}>{favError}</p>}
          {note && <p className={s.favError}>{note}</p>}

          <MyListToolbar
            q={q}
            onQ={setQ}
            searchLabel="自分の牌譜を検索"
            searchPlaceholder="牌譜を検索"
            statusLabel="公開状態で絞り込み"
            statusOptions={STATUS_OPTIONS}
            status={status}
            onStatus={setStatus}
            sort={sort}
            onSort={setSort}
            favOnly={favOnly}
            onFavOnly={setFavOnly}
            // 作成にはサインインが必要なので、未サインインでは新規ボタン自体を出さない。
            onNew={user ? () => router.push("/kifu/new") : undefined}
          />

          <div className={gc.feed}>
            {!user ? (
              <p className={s.loginNote}>
                自分の牌譜を見るには <Link href="/login">サインイン</Link> してください。
              </p>
            ) : games === null ? (
              <div className={gc.empty}>読み込み中…</div>
            ) : view.length === 0 ? (
              <div className={gc.empty} role={loadFailed ? "alert" : undefined}>
                {loadFailed
                  ? LIST_LOAD_ERROR_MESSAGE
                  : favOnly
                    ? "お気に入りした牌譜はまだありません"
                    : "該当する牌譜がありません"}
              </div>
            ) : (
              view.map((c) => (
                <GameCard
                  key={c.id}
                  title={c.title || "（無題の半荘）"}
                  badge={
                    <>
                      {/* 解析ジョブの状態（plan 8-3。サーバー導出。mobile と同一表示）。 */}
                      {c.analysisStatus === "processing" && (
                        <span className={`${gc.badge} ${gc.pub}`}>解析中</span>
                      )}
                      {c.analysisStatus === "failed" && (
                        <span className={`${gc.badge} ${gc.fail}`}>解析失敗</span>
                      )}
                      {/* 0局の解析中/失敗カードに「非公開・編集済」を並べない（mobile と同じ）。 */}
                      {!(c.analysisStatus && c.kyokuCount === 0) && (
                        <>
                          {c.publicCount > 0 ? (
                            <span className={`${gc.badge} ${gc.pub}`}>公開</span>
                          ) : (
                            <span className={`${gc.badge} ${gc.priv}`}>非公開</span>
                          )}
                          {/* 下書きが1局でもあれば注意色、無ければ編集済（mobile と同一表示）。 */}
                          {c.draftCount > 0 ? (
                            <span className={`${gc.badge} ${gc.draft}`}>下書き</span>
                          ) : (
                            <span className={`${gc.badge} ${gc.priv}`}>編集済</span>
                          )}
                        </>
                      )}
                    </>
                  }
                  meta={
                    <>
                      {fmtDateSlash(c.createdAt)}
                      <span className={gc.sep}>·</span>
                      {c.kyokuCount}局
                    </>
                  }
                  faved={c.viewerFaved}
                  favCount={c.favoriteCount}
                  onToggleFav={() => toggleFav("game", c)}
                  // 0局でも開ける（半荘ヘッダビューが受ける。Phase C。mobile と同じ動線）。
                  onOpen={() => router.push(`/kifu/${c.id}`)}
                  actions={
                    // 再解析は failed 全般（局がある半荘の追加解析失敗も救う。Phase C）。
                    // 削除ボタンは 0局限定（局がある半荘はエディタ側の削除に寄せる）。
                    c.analysisStatus === "failed" ? (
                      <>
                        {c.analysisJobId && (
                          <button type="button" onClick={() => void onRetry(c)}>
                            もう一度解析
                          </button>
                        )}
                        {c.kyokuCount === 0 && (
                          <button
                            type="button"
                            className={gc.danger}
                            onClick={() => void onDeleteFailed(c)}
                          >
                            削除
                          </button>
                        )}
                      </>
                    ) : undefined
                  }
                />
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
