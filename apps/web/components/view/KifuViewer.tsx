"use client";

import { type Kifu, type Seat, type Tile } from "@rigel/schema";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type PublicGameDetail } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { buildPlaybackState, playbackStateToKifu, resultLabel, standings } from "@rigel/ui";
import {
  SEAT_ORDER,
  buildRiverPlayback,
  revealCounts,
  roundNameForSeq,
  windOf,
} from "../../lib/board";
import { useBoardScale } from "../../lib/use-board-scale";
import { fmtDate } from "../../lib/format";
import { useFavorites } from "../../lib/use-favorites";
import { BrandMark } from "../BrandMark";
import { OssTileFace } from "../OssTileFace";
import { AgariOverlay } from "./AgariOverlay";
import { ViewBoard } from "./ViewBoard";
import s from "./kifu-view.module.css";

/** 局情報のドラ/裏ドラ1行（牌があれば小牌グリフ、無ければ —）。 */
function DoraRow({ label, codes }: { label: string; codes: Tile[] }) {
  return (
    <div className={s.irow}>
      <span>{label}</span>
      <b>
        {codes.length > 0
          ? codes.map((code, i) => (
              <span className={s.metaTile} key={`${code}-${i}`}>
                <OssTileFace code={code} />
              </span>
            ))
          : "—"}
      </b>
    </div>
  );
}

/**
 * 公開牌譜ビューア（クライアント）。データ取得・正規化・not-found 判定は
 * 親の Server Component（app/k/[gameId]/page.tsx）が済ませ、正規化済みの
 * `detail` を props で受け取る。ここは再生・全画面・共有などの対話だけを担う。
 */
export function KifuViewer({ detail, gameId }: { detail: PublicGameDetail; gameId: string }) {
  const { user } = useAuth();
  const { favs, toggle: toggleFav } = useFavorites();

  const [gi, setGi] = useState(0);
  const [reveal, setReveal] = useState(-1); // -1 = 全表示
  const [hideOpp, setHideOpp] = useState(false);
  const [sideOpen, setSideOpen] = useState(true);
  const [fs, setFs] = useState(false);
  const [roundMenu, setRoundMenu] = useState(false);
  const [shareLabel, setShareLabel] = useState("共有");
  const [agariClosed, setAgariClosed] = useState(false); // 上がりオーバーレイを閉じたか。

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFs(false);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, []);

  // スマホ幅の検知（卓のフィット余白と情報シートの初期開閉に使う）。
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 640px)");
    // スマホ幅では情報シートは初期状態で閉じておく（卓を最大化するため）。
    if (mq.matches) setSideOpen(false);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const log = detail.logs[gi];
  const kifu: Kifu | undefined = log?.kifu;
  const bottomSeat: Seat = kifu?.cameraBottomSeat ?? "east";
  const dealer: Seat = kifu?.meta.dealer ?? bottomSeat;

  // 打牌の擬似ターン順（東→南→西→北を河の枚数ぶん回す）。@rigel/ui の共有ロジック。
  const {
    order,
    junmeStops: dstops,
    maxTurn: maxLen,
  } = useMemo(
    () =>
      kifu
        ? buildRiverPlayback(kifu, dealer)
        : { order: [] as Seat[], junmeStops: [] as number[], maxTurn: 0 },
    [kifu, dealer],
  );

  const shown = reveal < 0 || reveal > order.length ? order.length : reveal;
  const revealed = useMemo(() => revealCounts(order, shown), [order, shown]);
  // 表示する点棒は「局の開始時点」で固定（この局の途中増減は出さない）。
  // 開始点 = 開始持ち点 ＋ 直前までの局の増減（standings）。
  const startPoints = useMemo(
    () =>
      kifu
        ? standings(
            detail.logs.slice(0, gi).map((l) => l.kifu),
            kifu.rules,
          )
        : null,
    [detail.logs, gi, kifu],
  );
  const playback = useMemo(() => (kifu ? buildPlaybackState(kifu, shown) : null), [kifu, shown]);
  const viewKifu = useMemo(
    () => (kifu && playback ? playbackStateToKifu(kifu, playback) : undefined),
    [kifu, playback],
  );

  // 上がりは「再生して末尾に達したとき」だけ出す。初期の全表示(reveal=-1)では出さない
  // （リロード時に一瞬ポップするのを防ぐ）。reveal が実インデックスで末尾以上のときのみ。
  const atEnd = order.length > 0 && reveal >= order.length;
  useEffect(() => {
    if (!atEnd) setAgariClosed(false);
  }, [atEnd]);

  // board fit（スマホは .main の実パディングに合わせ余白を最小化し、卓を画面幅いっぱいに）
  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef, fs ? 32 : narrow ? 12 : 48, [sideOpen]);

  function switchLog(i: number) {
    setGi(i);
    setReveal(-1);
    setRoundMenu(false);
    setAgariClosed(false);
  }

  // 取得・not-found は Server Component 側で処理済み。ここは局が空のときだけ守る。
  if (!log || !kifu || !viewKifu)
    return (
      <Shell>
        <p className={s.notice}>
          この半荘には局がありません。<Link href="/kifu">牌譜へ</Link>
        </p>
      </Shell>
    );

  const round = roundNameForSeq(log.seq);
  const authorName = detail.owner.handle ?? detail.owner.id.slice(0, 6);
  // 非公開の半荘（所有者だけが開ける再生ページ）。バッジと共有の出し分けに使う。
  const isPrivate = detail.logs[0]?.visibility === "private";
  const curJunme = Math.max(1, revealed[dealer]); // 巡目は最小1（0巡を出さない）
  // 和了（ロン/ツモ）のときだけ裏ドラを出す（リーチ和了で意味を持つため）。
  const isWin = viewKifu?.result === "ron" || viewKifu?.result === "tsumo";

  function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard?.writeText(url).catch(() => {});
    setShareLabel("コピーしました");
    setTimeout(() => setShareLabel("共有"), 1500);
  }

  return (
    <div className={`${s.app} themeBoard`}>
      {!fs && (
        <div className={s.bar}>
          <Link href="/kifu" className={s.brand}>
            <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
          </Link>
          <div className={s.crumb}>
            <Link href={isPrivate ? "/mypage" : "/kifu"}>{isPrivate ? "マイページ" : "牌譜"}</Link>
            <span>›</span>
            <span>牌譜を見る</span>
          </div>
        </div>
      )}

      {!fs && (
        <div className={s.khead}>
          <div className={s.khMain}>
            <h1 className={s.ktitle}>
              {detail.game.title || "（無題の半荘）"}
              <span className={`${s.badge} ${isPrivate ? s.priv : s.pub}`}>
                {isPrivate ? "非公開" : "公開"}
              </span>
            </h1>
            <div className={s.kmeta}>
              <Link href={`/u/${detail.owner.handle ?? detail.owner.id}`}>@{authorName}</Link>
              <span className={s.sep}>·</span>
              {fmtDate(detail.game.createdAt)}
              <span className={s.sep}>·</span>
              半荘 {detail.logs.length}局
            </div>
          </div>
          <div className={s.khAct}>
            {user?.id === detail.owner.id && (
              <Link className={s.iconbtn} href={`/kifu/${detail.game.id}`}>
                <svg viewBox="0 0 24 24">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                編集
              </Link>
            )}
            <button
              className={s.iconbtn}
              aria-pressed={sideOpen}
              onClick={() => setSideOpen((v) => !v)}
            >
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M15 4v16" />
              </svg>
              情報
            </button>
            <button
              className={`${s.iconbtn} ${s.fav} ${favs.has(gameId) ? s.on : ""}`}
              aria-pressed={favs.has(gameId)}
              aria-label="お気に入り"
              onClick={() => toggleFav(gameId)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
              </svg>
              お気に入り
            </button>
            {/* 共有は公開のみ（非公開のURLは所有者以外開けないため）。mobile と同一方針。 */}
            {!isPrivate && (
              <button className={s.iconbtn} onClick={onShare}>
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
        </div>
      )}

      <div className={`${s.wrap} ${!sideOpen || fs ? s.noSide : ""}`}>
        <div className={s.main} ref={mainRef}>
          <div className={s.boardcol}>
            {/* 卓の描画は ViewBoard（何切ると共有）。 */}
            <ViewBoard
              kifu={viewKifu}
              bottomSeat={bottomSeat}
              dealer={dealer}
              scale={scale}
              hideOpp={hideOpp}
              bottomName={detail.owner.displayName || detail.owner.handle}
              points={startPoints}
              center={
                <>
                  <div className={s.rd}>
                    {round} <span className={s.hb}>{viewKifu.meta.honba}本場</span>
                  </div>
                  {viewKifu.meta.kyotaku > 0 && (
                    <div className={s.kyotaku}>
                      供託 <b>{viewKifu.meta.kyotaku}</b>本
                    </div>
                  )}
                  {reveal >= 0 && playback?.activeDraw && (
                    <div className={s.draw}>
                      <span>ツモ</span>
                      <span className={s.metaTile}>
                        <OssTileFace code={playback.activeDraw.tile} />
                      </span>
                    </div>
                  )}
                </>
              }
            />

            <div className={s.controlbar}>
              <div className={s.cgrp}>
                <button
                  className={s.cbtn}
                  disabled={gi === 0}
                  aria-label="前の局"
                  onClick={() => switchLog(gi - 1)}
                >
                  <svg viewBox="0 0 24 24">
                    <rect x="5" y="5" width="2.4" height="14" rx="1" />
                    <path d="M20 5l-10 7 10 7z" />
                  </svg>
                </button>
                <select
                  className={`${s.clabel} ${s.csel}`}
                  aria-label="局を選択"
                  value={gi}
                  onChange={(e) => switchLog(Number(e.target.value))}
                >
                  {detail.logs.map((l, i) => (
                    <option key={l.id} value={i}>
                      {roundNameForSeq(l.seq)}
                    </option>
                  ))}
                </select>
                <button
                  className={s.cbtn}
                  disabled={gi >= detail.logs.length - 1}
                  aria-label="次の局"
                  onClick={() => switchLog(gi + 1)}
                >
                  <svg viewBox="0 0 24 24">
                    <rect x="16.6" y="5" width="2.4" height="14" rx="1" />
                    <path d="M4 5l10 7-10 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={s.cbtn}
                  disabled={shown <= 0}
                  aria-label="前の巡目"
                  onClick={() => {
                    const pv = [...dstops].reverse().find((x) => x < shown);
                    setReveal(pv ?? 0);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5l-8 7 8 7zM21 5l-8 7 8 7z" />
                  </svg>
                </button>
                <span className={s.clabel}>{curJunme}巡目</span>
                <button
                  className={s.cbtn}
                  disabled={!dstops.some((x) => x > shown)}
                  aria-label="次の巡目"
                  onClick={() => {
                    const nx = dstops.find((x) => x > shown);
                    setReveal(nx ?? order.length);
                  }}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M12 5l8 7-8 7zM3 5l8 7-8 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.cbtn} ${s.step}`}
                  disabled={shown <= 0}
                  aria-label="1手戻る"
                  onClick={() => setReveal(Math.max(0, shown - 1))}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M16 5l-9 7 9 7z" />
                  </svg>
                </button>
                <button
                  className={`${s.cbtn} ${s.step}`}
                  disabled={shown >= order.length}
                  aria-label="1手進む"
                  onClick={() => setReveal(Math.min(order.length, shown + 1))}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M8 5l9 7-9 7z" />
                  </svg>
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.ctog} ${!hideOpp ? s.on : ""}`}
                  aria-pressed={!hideOpp}
                  onClick={() => setHideOpp((v) => !v)}
                >
                  手牌表示
                </button>
              </div>

              <div className={s.cgrp}>
                <button
                  className={`${s.cbtn} ${s.step} ${s.fs}`}
                  aria-label={fs ? "全画面を終了" : "全画面"}
                  onClick={() => setFs((v) => !v)}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {atEnd && kifu.agari.length > 0 && !agariClosed && (
            <AgariOverlay kifu={viewKifu} dealer={dealer} onClose={() => setAgariClosed(true)} />
          )}
        </div>

        {sideOpen && !fs && (
          <aside className={s.side}>
            <div className={s.ssec}>
              <div className={s.snav}>
                <button
                  className={s.navg}
                  disabled={gi === 0}
                  aria-label="前の局"
                  onClick={() => switchLog(gi - 1)}
                >
                  ‹
                </button>
                <div className={s.roundwrap}>
                  <button className={s.rlabel} onClick={() => setRoundMenu((v) => !v)}>
                    {round}
                  </button>
                  {roundMenu && (
                    <div className={s.rmenu}>
                      {detail.logs.map((l, i) => (
                        <button
                          key={l.id}
                          className={`${s.ritem} ${i === gi ? s.on : ""}`}
                          onClick={() => switchLog(i)}
                        >
                          {roundNameForSeq(l.seq)} <small>第{l.seq}局</small>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className={s.navg}
                  disabled={gi >= detail.logs.length - 1}
                  aria-label="次の局"
                  onClick={() => switchLog(gi + 1)}
                >
                  ›
                </button>
              </div>
            </div>

            <div className={s.ssec}>
              <h4>局情報</h4>
              <div className={s.irow}>
                <span>親</span>
                <b>{windOf(dealer, dealer)}家</b>
              </div>
              <div className={s.irow}>
                <span>最終巡目</span>
                <b>{maxLen}巡</b>
              </div>
              <div className={s.irow}>
                <span>本場</span>
                <b>{viewKifu.meta.honba}本場</b>
              </div>
              <div className={s.irow}>
                <span>供託</span>
                <b>{viewKifu.meta.kyotaku}本</b>
              </div>
              <DoraRow label="ドラ" codes={viewKifu.meta.dora} />
              <div className={s.irow}>
                <span>結果</span>
                <b>{resultLabel(viewKifu.result)}</b>
              </div>
              {isWin && <DoraRow label="裏ドラ" codes={viewKifu.meta.uraDora} />}
            </div>

            <div className={s.ssec}>
              <h4>各家</h4>
              {SEAT_ORDER.map((seat) => (
                <div key={seat} className={s.arow}>
                  <span className={s.an}>{windOf(seat, dealer)}家</span>
                  <span className={s.ar}>
                    {viewKifu.seats[seat].hand.length}枚 / 河{viewKifu.seats[seat].river.length}
                    {startPoints && ` / ${startPoints[seat].toLocaleString()}点`}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`${s.app} themeBoard`}>{children}</div>;
}
