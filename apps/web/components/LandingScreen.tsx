"use client";

import { KifuSchema } from "@rigel/schema";
import { collectReviewItems, type QuizDayPoint } from "@rigel/ui";
import Link from "next/link";
import { useEffect } from "react";
import { BrandMark } from "./BrandMark";
import { GameCard } from "./GameCard";
import { QuizLineChart } from "./mypage/QuizLineChart";
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
const HERO_REVIEWS = collectReviewItems(HERO_KIFU).length;

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

/** 特訓カードのサンプル推移（QuizLineChart はサービス実装の実部品）。 */
const TRAINING_POINTS: QuizDayPoint[] = [
  { day: "2026-07-22", sessions: 1, correct: 5, total: 9, accuracy: 5 / 9, correctPerMinute: 2.4 },
  { day: "2026-07-23", sessions: 1, correct: 6, total: 9, accuracy: 6 / 9, correctPerMinute: 2.9 },
  { day: "2026-07-24", sessions: 0, correct: 0, total: 0, accuracy: null, correctPerMinute: null },
  { day: "2026-07-25", sessions: 2, correct: 7, total: 10, accuracy: 0.7, correctPerMinute: 3.4 },
  { day: "2026-07-26", sessions: 1, correct: 7, total: 9, accuracy: 7 / 9, correctPerMinute: 3.6 },
  { day: "2026-07-27", sessions: 1, correct: 8, total: 10, accuracy: 0.8, correctPerMinute: 3.9 },
  {
    day: "2026-07-28",
    sessions: 2,
    correct: 9,
    total: 11,
    accuracy: 9 / 11,
    correctPerMinute: 4.2,
  },
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
                実卓の写真から、AI が盤面を牌譜に再現。<b>残す・振り返る・出題する・鍛える</b>
                まで、これひとつ
              </p>
              <div className={`${s.cta} ${s.enter} ${s.d3}`}>
                <Link className={s.btnPrimary} href="/login">
                  無料ではじめる
                </Link>
                <Link className={s.btnGhost} href="/kifu">
                  サインインせずに見る
                </Link>
              </div>
              <p className={`${s.fine} ${s.enter} ${s.d3}`}>
                Google / Apple でサインイン ・ 閲覧は登録なしでも OK
              </p>
            </div>

            {/* 実部品 ViewBoard（テーマ変数はボード用をローカル供給）。 */}
            <div className={`${s.enter} ${s.d4}`}>
              <div className={s.shot}>
                <div className={s.shotBar}>
                  <b>7/28 友人戦</b>
                  <span>東一局 0本場</span>
                  <span className={s.shotAi}>AI 再現</span>
                </div>
                <div className={`${s.boardVars} ${s.boardWrap}`}>
                  <ViewBoard
                    kifu={HERO_KIFU}
                    bottomSeat="east"
                    dealer="east"
                    scale={0.5}
                    hideOpp
                    center={
                      <div className={s.boardCenter}>
                        <span>東一局</span>
                      </div>
                    }
                  />
                </div>
                <div className={s.shotFoot}>
                  <span className={s.shotBtn}>手順再生 ▸</span>
                  <span className={s.shotBtn}>局送り ›</span>
                  <span className={s.shotWarn}>要確認 {HERO_REVIEWS}</span>
                </div>
              </div>
              <p className={s.srcCap}>
                <span>📷 卓の写真</span>
                <svg viewBox="0 0 34 12" aria-hidden="true">
                  <path d="M1 6h30M26 2l5 4-5 4" />
                </svg>
                この盤面に
              </p>
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

        {/* bento: 四風の機能カード + 補助カード */}
        <section className={s.bento} id="features">
          <div className={s.bentoIn}>
            <div className={`${s.bhead} ${s.rv}`}>
              <h2 className={s.h2}>
                打ったあとは、<em>ぜんぶ</em>ここで
              </h2>
              <p>記録・共有・出題・特訓の4本柱 — 東・南・西・北</p>
            </div>
            <div className={s.grid}>
              <div className={`${s.card} ${s.c4} ${s.rv}`}>
                <WindTile code="1z" label="牌譜化" />
                <h3>
                  撮れば、<em>盤面になる</em>
                </h3>
                <p>
                  配牌・河・鳴きまで AI
                  がドラフト化。迷った牌は「要確認」で残るから、直すのは怪しい所だけ。点数計算まで自動
                </p>
                <div className={s.mini}>
                  <TileRow
                    tiles={["1m", "2m", "3m", "4p", "5p", "5p", "7s", "8s", "9s", "7z", "7z"]}
                    unknownIndex={5}
                  />
                  <p className={s.readNote}>
                    <span className={s.reviewBadge}>要確認 1</span>読めなかった牌だけ直す
                  </p>
                </div>
              </div>

              <div className={`${s.card} ${s.c2} ${s.rv}`}>
                <WindTile code="2z" label="公開・共有" />
                <h3>
                  リンクひとつで<em>共有</em>
                </h3>
                <p>URL で誰でも閲覧、SNS には盤面サムネ付き。非公開も選べる</p>
                {/* サービス実装の一覧カードそのもの（GameCard）。 */}
                <div className={s.gcWrap}>
                  <GameCard
                    title="7/28 友人戦"
                    meta={<span>南四局 ・ 8局</span>}
                    faved
                    favCount={12}
                    onToggleFav={() => {}}
                    onOpen={() => {}}
                  />
                </div>
                <Link className={s.more} href="/kifu">
                  公開牌譜を見る →
                </Link>
              </div>

              <div className={`${s.card} ${s.c3} ${s.rv}`}>
                <WindTile code="3z" label="何切る" />
                <h3>
                  その一打、<em>みんなの答え</em>と
                </h3>
                <p>牌譜から数タップで出題。回答すると分布が開き、感覚の立ち位置が分かる</p>
                <div className={s.mini}>
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
                        <OssTileFace code="6s" />
                      </span>
                      <span className={s.bar}>
                        <i style={{ width: "27%" }} />
                      </span>
                      <span className={s.pct}>27%</span>
                    </div>
                  </div>
                </div>
                <Link className={s.more} href="/problems">
                  公開の何切るを解く →
                </Link>
              </div>

              <div className={`${s.card} ${s.c3} ${s.rv}`}>
                <WindTile code="4z" label="特訓" />
                <h3>
                  60秒で、<em>手を速く</em>
                </h3>
                <p>清一色の待ち当て・牌効率をタイムアタックで反復。種目別グラフで伸びが見える</p>
                {/* サービス実装の特訓グラフそのもの（QuizLineChart）。 */}
                <div className={s.chartWrap}>
                  <QuizLineChart
                    points={TRAINING_POINTS}
                    title="清一色 何待ち"
                    meta="8回 ・ ベスト 4.2 ・ 正答率 78%"
                  />
                </div>
              </div>

              <div className={`${s.card} ${s.c3} ${s.appCard} ${s.rv}`}>
                <h3>撮影はアプリから</h3>
                <p>卓のそばで撮って、そのまま牌譜に。アカウントは web と共通</p>
                {/* TODO(store): 公開後に Apple / Google の公式バッジ素材とストアURLへ差し替える。 */}
                <div className={s.stores}>
                  <span className={s.store}>
                    <span className={s.storeIcon}></span>
                    <span className={s.storeText}>
                      <small>Download on the</small>
                      <b>App Store</b>
                    </span>
                  </span>
                  <span className={s.store}>
                    <span className={s.storeIcon}>▷</span>
                    <span className={s.storeText}>
                      <small>GET IT ON</small>
                      <b>Google Play</b>
                    </span>
                  </span>
                </div>
              </div>

              <div className={`${s.card} ${s.c3} ${s.startCard} ${s.rv}`}>
                <h3>まずは、見てみる</h3>
                <p>公開牌譜と何切るはサインインなしで閲覧 OK</p>
                <div className={s.ctaCenter}>
                  <Link className={s.btnPrimary} href="/login">
                    無料ではじめる
                  </Link>
                  <Link className={s.btnGhost} href="/kifu">
                    公開牌譜を見る
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* プラン */}
        <section className={`${s.plans} ${s.rv}`} id="plans">
          <div className={s.plansIn}>
            <h2 className={s.h2}>見る・解く・鍛えるは、ずっと無料</h2>
            <p className={s.plansSub}>
              AI 再現（写真からの牌譜化）は有料プランで ・ 価格は web のもの
            </p>
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
                  <li className={s.mute}>写真からの AI 再現</li>
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
                <span className={s.planNote}>セット卓なら月2〜3回の麻雀会ぶん</span>
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
                <span className={s.planNote}>毎週打つ人・記録係のあなたへ</span>
              </div>
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
