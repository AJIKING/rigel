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
import { BrandMark } from "../BrandMark";
import { OssTileFace } from "../OssTileFace";
import { ViewBoard } from "../view/ViewBoard";
import { ProblemBoardCenter } from "./ProblemBoardCenter";
import s from "./problem.module.css";

/**
 * 何切る問題の回答画面（/p/[id]）。
 * 回答するまで出題者の答え・解説・分布は見せない。集計（回答の保存と分布）は
 * ログイン時のみ（未ログインは回答体験＋答え・解説まで）。
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

  // 選択状態→アクションの組み立ては共有純関数（mobile と同一挙動）。
  const sel = { kind: problem.kind, tile: selTile, riichi, call };
  const needsTile = answerNeedsTile(sel);
  const canSubmit = canSubmitProblemAnswer(sel);

  async function submit() {
    const action = buildProblemAnswer(sel);
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

  function pickTile(tile: Tile) {
    if (answered || !needsTile) return;
    setSelTile((cur) => (cur === tile ? null : tile));
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
      <div className={s.bar}>
        <Link href="/problems" className={s.brand} aria-label="何切る一覧へ">
          <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
        </Link>
        <div className={s.crumb}>
          <Link href="/problems">何切る</Link>
          <span>›</span>
          <span>問題を解く</span>
        </div>
      </div>

      <main className={s.main} ref={mainRef}>
        <h1 className={s.title}>
          {post.title || "（無題の問題）"}
          {post.status === "draft" && <span className={s.draftBadge}>下書き</span>}
        </h1>
        <p className={s.meta}>
          {problem.meta.roundWind && `${seatLabel(problem.meta.roundWind)}場`}
          {dealer && ` ・ 親 ${windOf(dealer, dealer)}家（${seatLabel(dealer)}）`}
          {` ・ ${problem.meta.junme}巡目`}
          {problem.meta.honba > 0 && ` ・ ${problem.meta.honba}本場`}
          {problem.meta.kyotaku > 0 && ` ・ 供託${problem.meta.kyotaku}本`}
          <span className={s.sep}>·</span>
          {fmtDate(post.createdAt)}
        </p>

        {/* 盤面は牌譜ビューアと同じ卓（河・鳴きは卓上に。鳴き判断は対象牌を強調）。 */}
        <ViewBoard
          kifu={boardKifu}
          bottomSeat={pov}
          dealer={dealer ?? pov}
          scale={scale}
          bottomName="あなた"
          highlightRiver={highlightRiver}
          center={<ProblemBoardCenter meta={problem.meta} />}
        />

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

        {problem.kind === "call" && problem.targetSeat && targetTile && (
          <p className={s.question}>
            {seatLabel(problem.targetSeat)}家が切った {tileLabel(targetTile)} を鳴きますか？
          </p>
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
            <button
              type="button"
              className={s.submit}
              disabled={!canSubmit}
              onClick={() => void submit()}
            >
              回答する
            </button>
          </div>
        )}

        {/* 回答後: 自分の回答・出題者の答え・解説・分布 */}
        {answered && (
          <div className={s.resultBox}>
            <p className={s.myAnswer}>
              あなたの回答: <b>{actionLabel(answered)}</b>
            </p>
            <h2 className={s.resultHead}>出題者の答え</h2>
            <p className={s.authorAnswer}>{actionLabel(problem.answer)}</p>
            {problem.explanation && <p className={s.explanation}>{problem.explanation}</p>}

            {user ? (
              stats && (
                <>
                  <h2 className={s.resultHead}>回答分布（{stats.total}人）</h2>
                  <div className={s.stats}>
                    {statsRatios(stats.counts).map(({ key, count, ratio }) => (
                      <div key={key} className={s.statRow}>
                        <span className={s.statLabel}>
                          {choiceKeyLabel(key)}
                          {stats.myChoiceKey === key && <small>（あなた）</small>}
                        </span>
                        <span className={s.statBarWrap}>
                          <span className={s.statBar} style={{ width: `${ratio}%` }} />
                        </span>
                        <span className={s.statPct}>{ratio}%</span>
                        <span className={s.statCount}>{count}件</span>
                      </div>
                    ))}
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
