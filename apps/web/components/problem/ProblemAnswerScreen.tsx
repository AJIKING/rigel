"use client";

import {
  problemTargetTile,
  type CallType,
  type ProblemAction,
  type Seat,
  type Tile,
} from "@rigel/schema";
import {
  actionLabel,
  answerNeedsTile,
  buildProblemAnswer,
  canSubmitProblemAnswer,
  choiceKeyLabel,
  problemToKifu,
  seatLabel,
  sortHandTiles,
  statsRatios,
  tileLabel,
  CALL_CHOICES,
  SEAT_ORDER,
  windOf,
} from "@rigel/ui";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { answerProblemAction, getProblemStatsAction } from "../../app/actions";
import { type ProblemPost, type ProblemStats } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { fmtDate } from "../../lib/format";
import { useBoardScale } from "../../lib/use-board-scale";
import { AppHeader } from "../AppHeader";
import { OssTileFace } from "../OssTileFace";
import { ViewBoard } from "../view/ViewBoard";
import { ProblemBoardCenter } from "./ProblemBoardCenter";
import s from "./problem.module.css";

/**
 * 何切る問題の回答画面（/p/[id]）。正解は設けない（多様な正解を前提に、
 * 回答後に出題者のコメントとみんなの回答分布を見る）。回答するまで
 * コメント・分布は見せない。集計はログイン時のみ・再回答は上書き
 * （未ログインは回答体験まで）。
 */
export function ProblemAnswerScreen({ post }: { post: ProblemPost }) {
  const { user } = useAuth();
  const problem = post.problem;
  const pov = problem.pov;
  const hand = useMemo(() => sortHandTiles(problem.seats[pov].hand), [problem, pov]);
  const targetTile = problemTargetTile(problem);
  const dealer = problem.meta.dealer;

  const [selTile, setSelTile] = useState<Tile | null>(null);
  const [riichi, setRiichi] = useState(false);
  const [call, setCall] = useState<"pass" | CallType | null>(null);
  const [answered, setAnswered] = useState<ProblemAction | null>(null);
  const [stats, setStats] = useState<ProblemStats | null>(null);
  const [shareLabel, setShareLabel] = useState("共有");

  // 選択状態→アクションの組み立ては共有純関数（mobile と同一挙動）。
  const sel = { kind: problem.kind, tile: selTile, riichi, call };
  const needsTile = answerNeedsTile(sel);
  const pending = buildProblemAnswer(sel);
  const canSubmit = canSubmitProblemAnswer(sel);

  async function submit() {
    const action = pending;
    if (!action) return;
    setAnswered(action);
    // 集計はログイン時のみ（未ログインは分布に数えない＝そもそも呼ばない）。
    if (!user) return;
    const res = await answerProblemAction(post.id, action).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (res.ok) setStats(await getProblemStatsAction(post.id).catch(() => null));
  }

  /** 回答のやり直し（再回答はサーバ側 upsert で上書きされる）。選択は保持する。 */
  function redo() {
    setAnswered(null);
    setStats(null);
  }

  function pickTile(tile: Tile) {
    if (answered || !needsTile) return;
    setSelTile((cur) => (cur === tile ? null : tile));
  }

  /** 公開問題の共有（URLコピー）。 */
  function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url).catch(() => {});
    setShareLabel("コピーしました");
    setTimeout(() => setShareLabel("共有"), 1500);
  }

  // 盤面は牌譜ビューアと同じ卓（ViewBoard）で描く。河は全表示（既定）・鳴き判断は対象牌を強調。
  const boardKifu = useMemo(() => problemToKifu(problem), [problem]);
  const highlightRiver =
    problem.kind === "call" && problem.targetSeat
      ? { seat: problem.targetSeat, index: problem.seats[problem.targetSeat].river.length - 1 }
      : null;
  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef);

  return (
    <div className={`${s.app} themeBoard`}>
      {/* ヘッダは一覧・マイページと同じ共通ヘッダー（画面遷移で変わらない）。 */}
      <AppHeader active="problems" />

      <main className={s.main} ref={mainRef}>
        <div className={s.titleRow}>
          <h1 className={s.title}>
            {post.title || "（無題の問題）"}
            {post.status === "draft" && <span className={s.draftBadge}>下書き</span>}
          </h1>
          {post.status === "published" && (
            <button type="button" className={s.shareBtn} onClick={onShare}>
              <svg viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
              {shareLabel}
            </button>
          )}
        </div>
        <p className={s.meta}>
          {problem.meta.roundWind && `${seatLabel(problem.meta.roundWind)}場`}
          {dealer && ` ・ 親 ${windOf(dealer, dealer)}家（${seatLabel(dealer)}）`}
          {` ・ ${problem.meta.junme}巡目`}
          {problem.meta.honba > 0 && ` ・ ${problem.meta.honba}本場`}
          {problem.meta.kyotaku > 0 && ` ・ 供託${problem.meta.kyotaku}本`}
          <span className={s.sep}>·</span>
          {fmtDate(post.createdAt)}
        </p>

        {/* 質問見出し。正解は無い＝「あなたなら」を問う。 */}
        <h2 className={s.question}>
          {problem.kind === "discard"
            ? "あなたなら何を切る？"
            : problem.targetSeat && targetTile
              ? `${seatLabel(problem.targetSeat)}家が切った ${tileLabel(targetTile)}、あなたならどうする？`
              : ""}
        </h2>

        {/* 盤面は牌譜ビューアと同じ卓（河・鳴きは卓上に。鳴き判断は対象牌を強調）。 */}
        <div className={s.boardPanel}>
          <ViewBoard
            kifu={boardKifu}
            bottomSeat={pov}
            dealer={dealer ?? pov}
            scale={scale}
            bottomName="あなた"
            highlightRiver={highlightRiver}
            center={<ProblemBoardCenter meta={problem.meta} />}
          />
        </div>

        {/* 点数状況（手入力の記録のみ） */}
        {problem.scores && (
          <div className={s.row}>
            <span className={s.rowLabel}>点数</span>
            <span className={s.scores}>
              {SEAT_ORDER.map((seat: Seat) => (
                <span key={seat} className={s.score}>
                  {seatLabel(seat)} {problem.scores![seat].toLocaleString()}
                </span>
              ))}
            </span>
          </div>
        )}

        {/* 自分の手牌（理牌済み）＋ツモ牌 */}
        <div className={s.handRow}>
          <span className={s.rowLabel}>手牌</span>
          <span className={s.hand}>
            {hand.map((t, i) =>
              t.tile ? (
                <button
                  key={i}
                  type="button"
                  className={`${s.handTile} ${selTile === t.tile ? s.sel : ""}`}
                  aria-label={tileLabel(t.tile)}
                  aria-pressed={selTile === t.tile}
                  disabled={answered !== null || !needsTile}
                  onClick={() => pickTile(t.tile!)}
                >
                  <OssTileFace code={t.tile} />
                </button>
              ) : null,
            )}
            {problem.drawn && (
              <button
                type="button"
                className={`${s.handTile} ${s.drawn} ${selTile === problem.drawn ? s.sel : ""}`}
                aria-label={tileLabel(problem.drawn)}
                aria-pressed={selTile === problem.drawn}
                disabled={answered !== null}
                onClick={() => pickTile(problem.drawn!)}
              >
                <OssTileFace code={problem.drawn} />
              </button>
            )}
          </span>
        </div>
        {problem.drawn && <p className={s.drawnNote}>右端はツモ牌</p>}

        {/* 回答 UI */}
        {!answered && (
          <div className={s.answerBox}>
            {problem.kind === "discard" ? (
              <>
                <p className={s.hint}>切る牌をタップしてください。</p>
                <button
                  type="button"
                  className={`${s.riichiBtn} ${riichi ? s.on : ""}`}
                  aria-pressed={riichi}
                  onClick={() => setRiichi((v) => !v)}
                >
                  リーチ
                </button>
              </>
            ) : (
              <>
                <div className={s.callSeg} role="group" aria-label="鳴き">
                  {CALL_CHOICES.map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      className={call === key ? s.on : ""}
                      aria-pressed={call === key}
                      onClick={() => {
                        setCall(key);
                        if (key === "pass" || key === "kan") setSelTile(null);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {(call === "pon" || call === "chi") && (
                  <p className={s.hint}>鳴いた後に切る牌を手牌からタップしてください。</p>
                )}
              </>
            )}
            {/* 選択中の手を言葉でも確認できるようにする（押し間違い防止）。 */}
            {pending && (
              <p className={s.pendingChoice}>
                選択中: <b>{actionLabel(pending)}</b>
              </p>
            )}
            <button
              type="button"
              className={s.submit}
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              回答する
            </button>
            {!user && <p className={s.hint}>※ログインすると回答が集計されます。</p>}
          </div>
        )}

        {/* 回答後: 自分の回答・出題者のコメント・みんなの回答分布（正解は無い）。 */}
        {answered && (
          <div className={s.resultBox}>
            <div className={s.myAnswerRow}>
              <p className={s.myAnswer}>
                あなたの回答: <b>{actionLabel(answered)}</b>
              </p>
              <button type="button" className={s.redoBtn} onClick={redo}>
                回答をやり直す
              </button>
            </div>
            {problem.explanation && (
              <>
                <h2 className={s.resultHead}>出題者のコメント</h2>
                <p className={s.explanation}>{problem.explanation}</p>
              </>
            )}

            {user ? (
              stats && (
                <>
                  <h2 className={s.resultHead}>回答分布（{stats.total}人）</h2>
                  <div className={s.stats}>
                    {statsRatios(stats.counts).map(({ key, count, ratio }) => {
                      const mine = stats.myChoiceKey === key;
                      return (
                        <div key={key} className={s.statRow}>
                          <span className={s.statLabel}>
                            {choiceKeyLabel(key)}
                            {mine && <small>（あなた）</small>}
                          </span>
                          <span className={s.statBarWrap}>
                            <span
                              className={`${s.statBar} ${mine ? s.statBarMine : ""}`}
                              style={{ width: `${ratio}%` }}
                            />
                          </span>
                          <span className={s.statPct}>{ratio}%</span>
                          <span className={s.statCount}>{count}件</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            ) : (
              <p className={s.loginCta}>
                <Link href="/login">ログインすると回答分布が見られます →</Link>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
