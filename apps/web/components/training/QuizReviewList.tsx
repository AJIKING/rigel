"use client";

import type { Tile } from "@rigel/schema";
import {
  chinitsuUkeireCandidates,
  scoreDisplayTiles,
  scoreMeldViews,
  scoreYakuLine,
  tileLabel,
  ukeireLabel,
  ukeireReviewModel,
  type QuizAnswerRecord,
} from "@rigel/ui";
import { useMemo } from "react";
import { OssTileFace } from "../OssTileFace";
import s from "./training.module.css";

/**
 * 見直しリスト（回答した問題ごとに ○×・牌姿・あなたの回答・正解・受け入れ詳細）。
 * 特訓の結果画面と、マイページのセッション詳細（有料の保存レコード）で共有する。
 * 行構造・文言は結果画面の [決定] 2026-07-25 のまま（見出しテキストは置かない・
 * aria-label「見直しリスト」のみ）。
 */
export function QuizReviewList({ records }: { records: readonly QuizAnswerRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className={s.review}>
      {/* 見出しテキストは置かずリストを直接置く（aria-label は維持。
          [決定] 2026-07-25 オーナーレビュー）。 */}
      <ol className={s.reviewList} aria-label="見直しリスト">
        {records.map((r, i) => {
          // 分岐前にローカル束縛して、ネストした map 内でも型の絞り込みを保つ。
          const q = r.question;
          return (
            <li key={i} className={`${s.reviewRow} ${r.ok ? s.rowOk : s.rowNg}`}>
              {/* 1行目=番号＋○×のヘッダ。問題は回答・正解と同じ「ラベル＋牌列」の行にする。 */}
              <span className={s.reviewNo}>
                {i + 1}
                <span className={`${s.reviewMark} ${r.ok ? s.ok : s.ng}`}>{r.ok ? "○" : "×"}</span>
              </span>
              {q.kind === "score" ? (
                // 点数計算: 条件＋ドラ表示牌＋牌姿（手牌+副露+和了牌）に、回答/正解の
                // テキスト行と役の内訳（＝見直しで数え方まで学べる）。
                <>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>問題</span>
                    <span className={s.reviewText}>{q.label}</span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>ドラ表示牌</span>
                    <span role="group" aria-label="ドラ表示牌" className={s.reviewTiles}>
                      {q.doraIndicators.map((t, j) => (
                        <span key={j} className={s.reviewTile}>
                          <OssTileFace code={t} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span role="group" aria-label="牌姿" className={s.reviewTiles}>
                      {scoreDisplayTiles(q).map((t, j) => (
                        <span key={j} className={s.reviewTile}>
                          <OssTileFace code={t} />
                        </span>
                      ))}
                      {q.melds.map((m, mi) => (
                        <span key={`m${mi}`} className={s.reviewMeld}>
                          {scoreMeldViews(m, q.seatWind).map((v, j) =>
                            v.back ? (
                              <span key={j} className={`${s.reviewTile} ${s.tileBack}`} />
                            ) : (
                              <span key={j} className={`${s.reviewTile} ${v.lay ? s.tileLay : ""}`}>
                                <OssTileFace code={v.tile} />
                              </span>
                            ),
                          )}
                        </span>
                      ))}
                      <span className={`${s.reviewTile} ${s.winTile}`}>
                        <OssTileFace code={q.winTile} />
                      </span>
                    </span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>あなたの回答</span>
                    <span className={s.reviewText}>{r.pickedChoice}</span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>正解</span>
                    <span className={s.reviewText}>{q.answer}</span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>役</span>
                    <span className={s.reviewText}>{scoreYakuLine(q)}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>問題</span>
                    <span role="group" aria-label="問題" className={s.reviewTiles}>
                      {q.tiles.map((t, j) => (
                        <span key={j} className={s.reviewTile}>
                          <OssTileFace code={t} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>あなたの回答</span>
                    <span role="group" aria-label="あなたの回答" className={s.reviewTiles}>
                      {r.picked.map((t, j) => (
                        <span key={j} className={s.reviewTile}>
                          <OssTileFace code={t} />
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className={s.reviewAnswer}>
                    <span className={s.reviewLabel}>正解</span>
                    <span role="group" aria-label="正解" className={s.reviewTiles}>
                      {q.answer.map((t, j) => (
                        <span key={j} className={s.reviewTile}>
                          <OssTileFace code={t} />
                        </span>
                      ))}
                    </span>
                  </span>
                  {(q.kind === "efficiency" || q.kind === "chinitsuUkeire") && (
                    <UkeireDetail
                      tiles={q.tiles}
                      picked={r.picked[0] ?? null}
                      candidates={
                        q.kind === "chinitsuUkeire" ? chinitsuUkeireCandidates(q.suit) : undefined
                      }
                    />
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * 牌効率の見直し行に出す受け入れ詳細。計算は共有ヘッドレスモデル
 * （@rigel/ui の ukeireReviewModel）に一元化し、結果画面の描画時に行う
 * （60秒セッション中の負荷を増やさない）。計算は重い（14枚×34種の向聴総当たり）ので
 * useMemo で手牌が変わらない再レンダーでは再計算しない。
 */
function UkeireDetail({
  tiles,
  picked,
  candidates,
}: {
  tiles: readonly Tile[];
  picked: Tile | null;
  /** 受け入れとして数える牌種。出題時と同じものを渡す（清一色 牌効率は同色9種）。 */
  candidates?: readonly Tile[];
}) {
  const model = useMemo(
    () => ukeireReviewModel(tiles, picked, candidates),
    [tiles, picked, candidates],
  );
  const { mine, regressed, best } = model;
  return (
    <span className={s.ukeireDetail}>
      {mine && (
        <span className={s.ukeireLine}>
          <span
            role="group"
            aria-label={`あなたの回答の${ukeireLabel(mine.shanten)}`}
            className={s.ukeireBody}
          >
            {regressed && <span className={s.regress}>向聴戻し</span>}
            <span className={s.ukeireCount}>
              {ukeireLabel(mine.shanten)} {mine.tiles.length}種{mine.count}枚
            </span>
            <span className={s.reviewTiles}>
              {mine.tiles.map((t, j) => (
                <span key={j} className={s.reviewTile}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </span>
          </span>
        </span>
      )}
      {best.map((u) => (
        <span key={u.discard} className={s.ukeireLine}>
          <span className={s.reviewTile}>
            <OssTileFace code={u.discard} />
          </span>
          <span className={s.ukeireArrow}>→</span>
          <span
            role="group"
            aria-label={`正解${tileLabel(u.discard)}の${ukeireLabel(u.shanten)}`}
            className={s.ukeireBody}
          >
            <span className={s.ukeireCount}>
              {ukeireLabel(u.shanten)} {u.tiles.length}種{u.count}枚
            </span>
            <span className={s.reviewTiles}>
              {u.tiles.map((t, j) => (
                <span key={j} className={s.reviewTile}>
                  <OssTileFace code={t} />
                </span>
              ))}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
