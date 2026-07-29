"use client";

import { KifuSchema } from "@rigel/schema";
import { type QuizDayPoint } from "@rigel/ui";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useBoardScale } from "../lib/use-board-scale";
import { BrandMark } from "./BrandMark";
import { QuizLineChart } from "./mypage/QuizLineChart";
import { STAR_COLOR, STAR_PATH } from "./StarMark";
import { OssTileFace } from "./OssTileFace";
import { ViewBoard } from "./view/ViewBoard";
import s from "./landing.module.css";

/* ============================================================
   トップ（ランディング）v6 — docs/rigel-lp5.html の実装。
   [決定] 2026-07-29 オーナー合意（実サイト調査を反映）:
   - product-led hero: 実部品 ViewBoard ＋ KifuSchema のサンプル牌譜を見せる
   - 機能は bento grid（四風カード）。中身はアイコンではなくサービス実装の実部品
     （GameCard / QuizLineChart / OssTileFace の実牌アセット）
   - 文言は短く。句点はヒーローの一文だけ
   ============================================================ */

/** ヒーローの盤面（実データ）。東（手前）がリーチ・河に読めなかった牌（要確認）を1枚含む。 */
const HERO_KIFU = KifuSchema.parse({
  schemaVersion: "1.0.0",
  capturedAt: "2026-07-28T12:00:00.000Z",
  cameraBottomSeat: "east",
  meta: { dealer: "east", roundWind: "east", honba: 0, dora: ["3z"] },
  seats: {
    east: {
      hand: [
        { tile: "2m" },
        { tile: "3m" },
        { tile: "4m" },
        { tile: "4p" },
        { tile: "5p" },
        { tile: "6p" },
        { tile: "3s" },
        { tile: "4s" },
        { tile: "5s" },
        { tile: "7s" },
        { tile: "7s" },
        { tile: "6z" },
        { tile: "6z" },
      ],
      river: [
        { order: 1, tile: "9p" },
        { order: 2, tile: "1z", riichi: true },
        { order: 3, tile: null },
        { order: 4, tile: "8m", tsumogiri: true },
      ],
    },
    // 他家の手牌は hideOpp で裏向きになるため中身は任意。ただし null にすると
    // collectReviewItems（要確認）に数えられてしまうので実在の牌で埋める。
    south: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "3s" },
        { order: 2, tile: "7z" },
        { order: 3, tile: "1p" },
      ],
    },
    west: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "0p" },
        { order: 2, tile: "9s" },
      ],
    },
    north: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "2z" },
        { order: 2, tile: "9m" },
        { order: 3, tile: "1s" },
      ],
    },
  },
});

/** 何切るカードの手牌（実牌アセットで描く。八萬（ツモ）が選択中）。 */
const NANIKIRU_HAND = [
  "2m",
  "3m",
  "4m",
  "4p",
  "5p",
  "6p",
  "3s",
  "4s",
  "6s",
  "7s",
  "8m",
  "8m",
  "6z",
  "6z",
] as const;

/** 特訓カードのサンプル推移（QuizLineChart はサービス実装の実部品）。
 *  伸び一辺倒ではなく、落ち込み・休み（欠損日）・伸び直しのある2週間にして
 *  「上達の実感」の物語をグラフに持たせる。 */
const trainingDay = (
  day: string,
  cpm: number | null,
  sessions = cpm === null ? 0 : 1,
): QuizDayPoint => ({
  day,
  sessions,
  correct: cpm === null ? 0 : Math.round(cpm * 2),
  total: cpm === null ? 0 : Math.round(cpm * 2.5),
  accuracy: cpm === null ? null : 0.8,
  correctPerMinute: cpm,
});
const TRAINING_POINTS: QuizDayPoint[] = [
  trainingDay("2026-07-15", 2.1),
  trainingDay("2026-07-16", 2.8),
  trainingDay("2026-07-17", 2.3),
  trainingDay("2026-07-18", null),
  trainingDay("2026-07-19", 3.1, 2),
  trainingDay("2026-07-20", 3.5),
  trainingDay("2026-07-21", 3.2),
  trainingDay("2026-07-22", null),
  trainingDay("2026-07-23", 3.9, 2),
  trainingDay("2026-07-24", 3.6),
  trainingDay("2026-07-25", 4.4),
  trainingDay("2026-07-26", 4.1),
  trainingDay("2026-07-27", 4.8, 2),
  trainingDay("2026-07-28", 5.2, 2),
];

/** 風牌の見出しチップ（実牌アセット）。 */
function WindTile({ code, label }: { code: "1z" | "2z" | "3z" | "4z"; label: string }) {
  return (
    <span className={s.wind}>
      <span className={s.wtile} aria-hidden="true">
        <OssTileFace code={code} />
      </span>
      <span className={s.wlabel}>{label}</span>
    </span>
  );
}

/** 一列の実牌（何切る・牌譜化カード用）。 */
function TileRow({
  tiles,
  pickIndex,
  unknownIndex,
}: {
  tiles: readonly string[];
  pickIndex?: number;
  unknownIndex?: number;
}) {
  return (
    <div className={s.tileRow} aria-hidden="true">
      {tiles.map((code, i) => (
        <span
          key={i}
          className={`${s.ltile} ${i === pickIndex ? s.pick : ""} ${i === unknownIndex ? s.unknown : ""}`}
        >
          <OssTileFace code={i === unknownIndex ? null : (code as never)} />
        </span>
      ))}
    </div>
  );
}

export function LandingScreen() {
  // 盤面はビューアと同じ流儀でコンテナ幅にフィットさせる（固定 scale だと左右が切れる）。
  const boardRef = useRef<HTMLDivElement>(null);
  const boardScale = useBoardScale(boardRef, 32);

  // 章のスクロール出現（reduced-motion では即時表示）。
  // matchMedia / IntersectionObserver が無い環境（jsdom・古いブラウザ）は即時表示に倒す。
  useEffect(() => {
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(`.${s.rv}`).forEach((el) => el.classList.add(s.on));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add(s.on);
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    document.querySelectorAll(`.${s.rv}`).forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className={`${s.shell} themeApp`}>
      <nav className={s.nav}>
        <div className={s.navIn}>
          <Link className={s.brand} href="/">
            <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
          </Link>
          <div className={s.navLinks}>
            <a href="#features">できること</a>
            <a href="#plans">プラン</a>
            <Link href="/kifu">公開牌譜</Link>
            <Link href="/problems">何切る</Link>
          </div>
          <div className={s.spacer} />
          <Link className={s.navSign} href="/login">
            サインイン
          </Link>
        </div>
      </nav>

      <main>
        {/* hero: 左寄せ見出し + 実部品の盤面（product-led） */}
        <section className={s.hero}>
          <div className={s.heroIn}>
            <div>
              <p className={`${s.kicker} ${s.enter} ${s.d1}`}>雀力を高める — 麻雀をさらに奥深く</p>
              <h1 className={`${s.h1} ${s.enter} ${s.d1}`}>
                麻雀の記録を、
                <br />
                <em>撮るだけ</em>で。
              </h1>
              <p className={`${s.lead} ${s.enter} ${s.d2}`}>
                <b>残す・振り返る・出題する・鍛える</b>まで、これひとつ
              </p>
              <div className={`${s.cta} ${s.enter} ${s.d3}`}>
                <Link className={s.btnPrimary} href="/login">
                  無料ではじめる
                </Link>
                <Link className={s.btnGhost} href="/kifu">
                  サインインせずに見る
                </Link>
              </div>
            </div>

            {/* 実部品 ViewBoard（テーマ変数はボード用をローカル供給）。 */}
            <div className={`${s.enter} ${s.d4}`}>
              <div className={s.shot}>
                <div className={`${s.boardVars} ${s.boardWrap}`} ref={boardRef}>
                  <ViewBoard
                    kifu={HERO_KIFU}
                    bottomSeat="east"
                    dealer="east"
                    scale={boardScale}
                    hideOpp
                    center={
                      <div className={s.boardCenter}>
                        <span>東一局</span>
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 事実ベースの信頼ストリップ */}
        <section className={s.trust}>
          <div className={s.trustIn}>
            <div className={s.trustItem}>
              <b>撮影画像は保存しません</b>残るのは牌譜データだけ
            </div>
            <div className={s.trustItem}>
              <b>Mリーグ・天鳳ルール対応</b>点数計算までプリセットで
            </div>
            <div className={s.trustItem}>
              <b>iOS・Android・Web</b>アカウントとプランは共通
            </div>
          </div>
        </section>

        {/* 機能紹介: 四風の縦積みセクション（カードにしない・横に詰め込まない）。
            ビジュアルは実部品を枠なしで直接置く。 */}
        <section className={s.features} id="features">
          <div className={s.featuresIn}>
            <div className={`${s.bhead} ${s.rv}`}>
              <h2 className={s.h2}>
                打ったあとは、<em>ぜんぶ</em>ここで
              </h2>
            </div>

            <div className={`${s.feature} ${s.rv}`}>
              <WindTile code="1z" label="牌譜化" />
              <h3>
                撮れば、<em>盤面になる</em>
              </h3>
              {/* 「AI が読み取っている」絵: 検出ボックスのコーナーマーク＋スキャンライン。
                  読めなかった1枚だけ「?」で残る（ヒーロー=結果、ここ=過程、の役割分担）。 */}
              <div className={s.featureVis}>
                <div className={s.scanFrame} aria-hidden="true">
                  <i className={`${s.corner} ${s.cTL}`} />
                  <i className={`${s.corner} ${s.cTR}`} />
                  <i className={`${s.corner} ${s.cBL}`} />
                  <i className={`${s.corner} ${s.cBR}`} />
                  <div className={s.scanline} />
                  <TileRow
                    tiles={["1m", "2m", "3m", "4p", "5p", "5p", "7s", "8s", "9s", "7z", "7z"]}
                    unknownIndex={5}
                  />
                </div>
              </div>
            </div>

            <div className={`${s.feature} ${s.rv}`}>
              <WindTile code="2z" label="公開・共有" />
              <h3>
                リンクひとつで<em>共有</em>
              </h3>
              {/* 「SNS に展開された姿」: 実際の OGP（/k の opengraph-image と同じ構図）を
                  埋め込みカード風フレームで見せる。 */}
              <div className={s.featureVis}>
                <div className={s.embed} aria-hidden="true">
                  <div className={s.embedImg}>
                    <div className={s.embedBrand}>
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <path d={STAR_PATH} fill={STAR_COLOR} />
                      </svg>
                      <span>RIGEL</span>
                    </div>
                    <div className={s.embedTitle}>7/28 友人戦</div>
                    <div className={s.embedInfo}>南四局 ・ 8局</div>
                  </div>
                  <div className={s.embedMeta}>
                    <span className={s.embedDomain}>rigel.plaria.co.jp</span>
                    <span className={s.embedText}>7/28 友人戦 ・ 麻雀牌譜 | RIGEL</span>
                  </div>
                </div>
              </div>
              <Link className={s.more} href="/kifu">
                公開牌譜を見る →
              </Link>
            </div>

            <div className={`${s.feature} ${s.rv}`}>
              <WindTile code="3z" label="何切る" />
              <h3>
                その一打、<em>みんなの答え</em>と比べる
              </h3>
              <div className={s.featureVis}>
                <TileRow tiles={NANIKIRU_HAND} pickIndex={11} />
                <div className={s.dist}>
                  <div className={`${s.distRow} ${s.win}`}>
                    <span className={s.ltileS}>
                      <OssTileFace code="8m" />
                    </span>
                    <span className={s.bar}>
                      <i style={{ width: "58%" }} />
                    </span>
                    <span className={s.pct}>58%</span>
                  </div>
                  <div className={s.distRow}>
                    <span className={s.ltileS}>
                      <OssTileFace code="6z" />
                    </span>
                    <span className={s.bar}>
                      <i style={{ width: "34%" }} />
                    </span>
                    <span className={s.pct}>34%</span>
                  </div>
                </div>
              </div>
              <Link className={s.more} href="/problems">
                公開の何切るを解く →
              </Link>
            </div>

            <div className={`${s.feature} ${s.rv}`}>
              <WindTile code="4z" label="特訓" />
              <h3>
                60秒で、<em>最速の判断</em>をする
              </h3>
              {/* サービス実装の特訓グラフそのもの（QuizLineChart）。 */}
              <div className={`${s.featureVis} ${s.chartWrap}`}>
                <QuizLineChart
                  points={TRAINING_POINTS}
                  title="清一色 何待ち"
                  meta="16回 ・ ベスト 5.2 ・ 正答率 80%"
                />
              </div>
            </div>
          </div>
        </section>

        {/* プラン */}
        <section className={`${s.plans} ${s.rv}`} id="plans">
          <div className={s.plansIn}>
            <h2 className={s.h2}>見る・解く・鍛えるは、ずっと無料</h2>
            <div className={s.pgrid}>
              <div className={s.plan}>
                <span className={s.planName}>Free</span>
                <span className={s.planPrice}>
                  ¥0<small> / 月</small>
                </span>
                <ul>
                  <li>公開牌譜・何切るの閲覧と回答</li>
                  <li>特訓（60秒タイムアタック）</li>
                  <li>手入力での牌譜作成・保存（非公開5・下書き5半荘）</li>
                </ul>
              </div>
              <div className={`${s.plan} ${s.hot}`}>
                <span className={s.planName}>RIGEL Next</span>
                <span className={s.planPrice}>
                  ¥480<small> / 月</small>
                </span>
                <ul>
                  <li>AI 再現 月100回</li>
                  <li>保存無制限（非公開・下書き）</li>
                  <li>Free の全機能</li>
                </ul>
              </div>
              <div className={s.plan}>
                <span className={s.planName}>RIGEL Pro</span>
                <span className={s.planPrice}>
                  ¥1,480<small> / 月</small>
                </span>
                <ul>
                  <li>AI 再現 月320回</li>
                  <li>保存無制限（非公開・下書き）</li>
                  <li>Free の全機能</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 締めの CTA とアプリ導線（カードにはしない）。 */}
        <section className={`${s.closing} ${s.rv}`}>
          <div className={s.closingIn}>
            <h2 className={s.h2}>まずは、見てみる</h2>
            <p className={s.closingSub}>公開牌譜と何切るはサインインなしで閲覧 OK</p>
            <div className={s.ctaCenter}>
              <Link className={s.btnPrimary} href="/login">
                無料ではじめる
              </Link>
              <Link className={s.btnGhost} href="/kifu">
                公開牌譜を見る
              </Link>
            </div>
            <p className={s.appsCap}>
              撮影はアプリから — 卓のそばで撮って、そのまま牌譜に。アカウントは web と共通
            </p>
            {/* 公式バッジ素材（Apple: marketingtools 公式SVG / Google: play.google.com 公式PNG）。
                TODO(store): アプリ公開後にストアURLへリンクする。 */}
            <div className={s.stores}>
              <span className={`${s.storeBadge} ${s.badgeApple}`}>
                <img src="/badges/app-store-ja.svg" alt="App Store からダウンロード" />
              </span>
              <span className={`${s.storeBadge} ${s.badgeGoogle}`}>
                <img src="/badges/google-play-ja.png" alt="Google Play で手に入れよう" />
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <div className={s.footIn}>
          <Link className={s.brand} href="/">
            <BrandMark starClassName={s.star} wordmarkClassName={s.wm} />
          </Link>
          <nav>
            <Link href="/kifu">公開牌譜</Link>
            <Link href="/problems">何切る</Link>
            <Link href="/terms">利用規約</Link>
            <Link href="/privacy">プライバシーポリシー</Link>
          </nav>
          <span>© 2026 Plaria</span>
        </div>
      </footer>
    </div>
  );
}
