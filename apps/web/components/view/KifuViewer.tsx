"use client";

import { type Kifu, type Seat, type Tile } from "@rigel/schema";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { type PublicGameDetail } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import {
  buildPlaybackFrame,
  playbackKifu,
  resultLabel,
  rulePresetLabel,
  signedPoints,
  ruleSummaryRows,
  stepDisplay,
  stepHasDraw,
  type StepPhase,
} from "@rigel/ui";
import {
  SEAT_ORDER,
  hasPlayerPoints,
  roundHonbaLabel,
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

/** ドラ牌の小牌グリフ列（サイドパネルの局情報と卓中央で共用）。 */
function DoraTiles({ codes }: { codes: Tile[] }) {
  return codes.map((code, i) => (
    <span className={s.metaTile} key={`${code}-${i}`}>
      <OssTileFace code={code} />
    </span>
  ));
}

/** 局情報のドラ/裏ドラ1行（牌があれば小牌グリフ、無ければ —）。 */
function DoraRow({ label, codes }: { label: string; codes: Tile[] }) {
  return (
    <div className={s.irow}>
      <span>{label}</span>
      <b>{codes.length > 0 ? <DoraTiles codes={codes} /> : "—"}</b>
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
  // 上がりオーバーレイ。次ボタンで開き、閉じるボタン/前ボタン/位置移動で閉じる。
  const [agariOpen, setAgariOpen] = useState(false);
  // 視点席（ネームプレート押下で切替）。null は牌譜どおり（撮影者が手前）。局を跨いでも保つ。
  const [povSeat, setPovSeat] = useState<Seat | null>(null);
  // リーグ戦ポイントの表示。null=自動（全員 0.0 なら隠す）。トグルで明示 ON/OFF。
  const [ptsPref, setPtsPref] = useState<boolean | null>(null);

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
  // リーグ戦ポイントの実効表示（明示トグル > 自動＝全員 0.0 なら隠す）。
  const showPlayerPoints = ptsPref ?? hasPlayerPoints(kifu?.players);

  // 再生フレーム（打牌順・巡目・点棒・再生局面）は @rigel/ui の共有ロジックで一括導出。
  // 点棒は「局の開始時点」で固定（この局の途中増減は出さない）。
  const frame = useMemo(
    () =>
      kifu
        ? buildPlaybackFrame({
            kifu,
            prevKifus: detail.logs.slice(0, gi).map((l) => l.kifu),
            reveal,
            povSeat,
          })
        : null,
    [detail.logs, gi, kifu, reveal, povSeat],
  );

  // ステップの半歩: draw（ツモ牌が手牌右端に入る。盤面は1手前のまま）→
  // drop（打牌が河へ落ち、手牌が理牌される）→ …末尾では winDraw（ツモ和了牌を右端へ）
  // → 和了演出、を進む/戻るボタンが半歩ずつ刻む（タイマーでは進めない）。
  // ツモ牌が不明な手は半歩なし＝1押し1打牌。フェーズ→表示物の写像は @rigel/ui（stepDisplay）。
  const [stepPhase, setStepPhase] = useState<StepPhase | null>(null);
  const shown = frame?.shown ?? 0;

  // draw 半歩で見せる1手前の局面。Zod parse を含むため draw 表示中だけ導出する。
  const prevKifu = useMemo(
    () => (stepPhase === "draw" && kifu && shown > 0 ? playbackKifu(kifu, shown - 1) : null),
    [kifu, shown, stepPhase],
  );
  const step = frame ? stepDisplay(stepPhase, frame, prevKifu) : null;

  /** 再生位置ジャンプ（巡目送り・局切替など）。半歩は挟まず演出も出さない。 */
  function jumpTo(nextReveal: number) {
    setReveal(nextReveal);
    setStepPhase(null);
    setAgariOpen(false);
  }

  /** 次ボタン: ツモ→捨て→…→（末尾）和了牌ツモ→和了演出、の半歩を1つ進める。 */
  function stepForward() {
    if (!kifu || !frame || agariOpen) return;
    if (stepPhase === "draw") {
      setStepPhase("drop");
      return;
    }
    if (shown >= frame.order.length) {
      // 末尾（初期の全表示含む）: ツモ和了なら先に和了牌をツモり、次押しで和了演出。
      if (kifu.agari.length === 0) return;
      setReveal(frame.order.length); // -1（全表示）でも実位置に確定させる。
      if (frame.tsumoWin && stepPhase !== "winDraw") {
        setStepPhase("winDraw");
        return;
      }
      setAgariOpen(true);
      return;
    }
    const next = shown + 1;
    setReveal(next);
    setStepPhase(stepHasDraw(kifu, next) ? "draw" : "drop");
  }

  /** 前ボタン: 和了演出を閉じる→和了牌を引っ込める→打牌を引っ込めてツモ表示へ→前の手…と逆に刻む。 */
  function stepBack() {
    if (!kifu) return;
    if (agariOpen) {
      setAgariOpen(false);
      return;
    }
    if (stepPhase === "winDraw") {
      setStepPhase(null);
      return;
    }
    if (stepPhase === "draw") {
      jumpTo(Math.max(0, shown - 1));
      return;
    }
    if (shown > 0 && stepHasDraw(kifu, shown)) {
      setReveal(shown);
      setStepPhase("draw");
      return;
    }
    jumpTo(Math.max(0, shown - 1));
  }

  // board fit（スマホは .main の実パディングに合わせ余白を最小化し、卓を画面幅いっぱいに）
  const mainRef = useRef<HTMLDivElement>(null);
  const scale = useBoardScale(mainRef, fs ? 32 : narrow ? 12 : 48, [sideOpen]);

  /** 局の切替（局送り・局選択・和了ダイアログの「次の局へ」共通）。
   *  移動先は開始位置（配牌＝打牌前）から再生する。初期表示（reveal=-1 の全表示）と
   *  違い、局を移動する操作は「頭から見る」意図なので最終巡目にしない。 */
  function switchLog(i: number) {
    setGi(i);
    setReveal(0);
    setStepPhase(null);
    setRoundMenu(false);
    setAgariOpen(false);
  }

  // 取得・not-found は Server Component 側で処理済み。ここは局が空のときだけ守る。
  if (!log || !kifu || !frame || !step)
    return (
      <Shell>
        <p className={s.notice}>
          この半荘には局がありません。<Link href="/kifu">牌譜へ</Link>
        </p>
      </Shell>
    );

  const {
    order,
    junmeStops: dstops,
    maxTurn: maxLen,
    curJunme,
    startPoints,
    viewKifu,
    bottomSeat,
    dealer,
  } = frame;
  // 卓の表示物（局面・右端スロット・drop 対象）はフェーズ写像（@rigel/ui）から得る。
  const { kifu: boardKifu, drawnTile, animateDiscard } = step;

  const round = roundNameForSeq(log.seq);
  const authorName = detail.owner.handle ?? detail.owner.id.slice(0, 6);
  // 非公開の半荘（所有者だけが開ける再生ページ）。バッジと共有の出し分けに使う。
  const isPrivate = detail.logs[0]?.visibility === "private";
  // 和了（ロン/ツモ）のときだけ裏ドラを出す（リーチ和了で意味を持つため）。
  const isWin = viewKifu.result === "ron" || viewKifu.result === "tsumo";

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
        {/* data-main はレイアウト検証（Playwright）用の安定フック（全画面時の下端充填を測る）。 */}
        <div className={s.main} ref={mainRef} data-main="">
          <div className={s.boardcol}>
            {/* 卓の描画は ViewBoard（何切ると共有）。 */}
            <ViewBoard
              kifu={boardKifu}
              bottomSeat={bottomSeat}
              dealer={dealer}
              drawnTile={drawnTile}
              scale={scale}
              hideOpp={hideOpp}
              animateDiscard={animateDiscard}
              // 撮影者名は撮影者の席（cameraBottomSeat）に付ける。視点を回しても席と一緒に動く。
              seatName={{
                seat: kifu.cameraBottomSeat ?? "east",
                name: detail.owner.displayName || detail.owner.handle || "",
              }}
              onSeatSelect={setPovSeat}
              points={startPoints}
              showPlayerPoints={showPlayerPoints}
              center={
                <>
                  <div className={s.rd}>
                    {round} <span className={s.hb}>{boardKifu.meta.honba}本場</span>
                  </div>
                  {boardKifu.meta.kyotaku > 0 && (
                    <div className={s.kyotaku}>
                      供託 <b>{boardKifu.meta.kyotaku}</b>本
                    </div>
                  )}
                  {/* ドラは実卓と同じく中央に常設（mobile と同一）。ツモは中央に出さない
                      （手牌右端スロットへのフライイン演出で分かるため）。 */}
                  {boardKifu.meta.dora.length > 0 && (
                    <div className={s.dora}>
                      <span>ドラ</span>
                      <DoraTiles codes={boardKifu.meta.dora} />
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
                      {/* 本場も出す：連荘（同じ局順の局）を区別できる唯一の手掛かり。 */}
                      {roundHonbaLabel(l.seq, l.kifu.meta.honba)}
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
                    jumpTo(pv ?? 0);
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
                    jumpTo(nx ?? order.length);
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
                  onClick={stepBack}
                >
                  <svg viewBox="0 0 24 24">
                    <path d="M16 5l-9 7 9 7z" />
                  </svg>
                </button>
                <button
                  className={`${s.cbtn} ${s.step}`}
                  disabled={
                    agariOpen ||
                    (shown >= order.length && stepPhase !== "draw" && kifu.agari.length === 0)
                  }
                  aria-label="1手進む"
                  onClick={stepForward}
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
                {/* リーグ戦ポイントの表示切替（players がある半荘のみ）。
                    既定は自動＝全員 0.0 なら隠す。 */}
                {kifu.players && (
                  <button
                    className={`${s.ctog} ${showPlayerPoints ? s.on : ""}`}
                    aria-pressed={showPlayerPoints}
                    onClick={() => setPtsPref(!showPlayerPoints)}
                  >
                    ポイント
                  </button>
                )}
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

          {/* 和了は最後の演出（drop / 和了牌のフライイン）を見せ切ってから遅延して開く。 */}
          {/* 和了演出は次ボタンで開く（末尾: ロン=打牌の次、ツモ=和了牌ツモの次）。 */}
          {agariOpen && kifu.agari.length > 0 && (
            <AgariOverlay
              kifu={viewKifu}
              dealer={dealer}
              onClose={() => setAgariOpen(false)}
              onNext={gi < detail.logs.length - 1 ? () => switchLog(gi + 1) : null}
            />
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
                          {/* 本場も出す：連荘（同じ局順の局）の区別用。 */}
                          {roundHonbaLabel(l.seq, l.kifu.meta.honba)} <small>第{l.seq}局</small>
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
                    {` / ${startPoints[seat].toLocaleString()}点`}
                  </span>
                </div>
              ))}
            </div>

            {/* 選手情報（players がある半荘のみ）。ネームプレートの選手名は切り詰められる
                ことがあるため、ここではフル名＋ポイント状況を一覧できるようにする。 */}
            {kifu.players && (
              <div className={s.ssec}>
                <h4>選手情報</h4>
                {SEAT_ORDER.map((seat) => (
                  <div key={seat} className={s.irow}>
                    <span>
                      {windOf(seat, dealer)}家 {kifu.players?.[seat].name || "—"}
                    </span>
                    <b>{signedPoints(kifu.players?.[seat].points ?? 0)}</b>
                  </div>
                ))}
              </div>
            )}

            {/* 半荘ルール（半荘単位＝全局共通）。項目が多いので折りたたみで出す。 */}
            <details className={s.ssec}>
              <summary className={s.rulesum}>ルール（{rulePresetLabel(kifu.rules)}）</summary>
              {ruleSummaryRows(kifu.rules).map((r) => (
                <div key={r.title} className={s.irow}>
                  <span>{r.title}</span>
                  <b>{r.value}</b>
                </div>
              ))}
            </details>
          </aside>
        )}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className={`${s.app} themeBoard`}>{children}</div>;
}
