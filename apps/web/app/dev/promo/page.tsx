"use client";

import { KifuSchema, type Tile } from "@rigel/schema";
import type { QuizDayPoint } from "@rigel/ui";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import { BrandMark } from "../../../components/BrandMark";
import land from "../../../components/landing.module.css";
import { QuizLineChart } from "../../../components/mypage/QuizLineChart";
import { OssTileFace } from "../../../components/OssTileFace";
import { STAR_COLOR, STAR_PATH } from "../../../components/StarMark";
import { ViewBoard } from "../../../components/view/ViewBoard";
import { BRAND } from "../../../lib/brand";
import { siteHost } from "../../../lib/og-meta";
import { PROMO_SHOTS } from "../../../lib/promo-shots";
import s from "./promo.module.css";

/* ============================================================
   ストア用プロモ画像のフィクスチャ（Playwright で撮影して docs/store-assets/ へ）。
   LP v6 と同じ実部品主義: 盤面 = ViewBoard、牌 = OssTileFace、グラフ = QuizLineChart。
   フレームの寸法・一覧は lib/promo-shots.ts が単一ソース。
   本番には出さない（NODE_ENV=production では 404）。
   ============================================================ */

/** 盤面フレーム用の牌譜（東=手前がリーチ・河に AI が読めなかった1枚（null）を含む）。 */
const BOARD_KIFU = KifuSchema.parse({
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
        { order: 2, tile: "1z" },
        { order: 3, tile: null },
        { order: 4, tile: "8m", tsumogiri: true },
        { order: 5, tile: "5m", riichi: true },
        { order: 6, tile: "2p", tsumogiri: true },
        { order: 7, tile: "9s", tsumogiri: true },
      ],
    },
    // 他家は hideOpp で裏向き。null にすると要確認に数えられるため実在牌で埋める。
    south: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "3s" },
        { order: 2, tile: "7z" },
        { order: 3, tile: "1p" },
        { order: 4, tile: "9m" },
        { order: 5, tile: "2z" },
        { order: 6, tile: "4p" },
        { order: 7, tile: "6s", tsumogiri: true },
        { order: 8, tile: "1m" },
      ],
    },
    west: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "0p" },
        { order: 2, tile: "9s" },
        { order: 3, tile: "5z" },
        { order: 4, tile: "2s", tsumogiri: true },
        { order: 5, tile: "7p" },
        { order: 6, tile: "3z" },
      ],
    },
    north: {
      hand: Array.from({ length: 13 }, () => ({ tile: "1m" })),
      river: [
        { order: 1, tile: "2z" },
        { order: 2, tile: "9m" },
        { order: 3, tile: "1s" },
        { order: 4, tile: "4z" },
        { order: 5, tile: "8p", tsumogiri: true },
        { order: 6, tile: "2s" },
        { order: 7, tile: "6m" },
      ],
    },
  },
});

/** 特訓（清一色 何待ち）の出題例: 1234555566789m（答えは見せない。5の4枚目は赤）。 */
const CHINITSU_HAND: readonly Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "5m",
  "5m",
  "0m",
  "6m",
  "6m",
  "7m",
  "8m",
  "9m",
];

/** 何切るの牌姿: 113m 2245667p 2478s（オーナー指定 2026-07-31。答え・選択は見せない）。 */
const NANIKIRU_HAND: readonly (Tile | null)[] = [
  "1m",
  "1m",
  "3m",
  "2p",
  "2p",
  "4p",
  "5p",
  "6p",
  "6p",
  "7p",
  "2s",
  "4s",
  "7s",
  "8s",
];

/** 特訓カードの推移（LP と同じ2週間: 落ち込み・休み・伸び直しの物語）。 */
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

/** マニフェスト寸法で固定したフレーム（撮影単位。data-shot が撮影セレクタ）。 */
function Frame({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const shot = PROMO_SHOTS.find((sh) => sh.id === id);
  if (!shot) throw new Error(`unknown promo shot: ${id}`);
  return (
    <section
      className={`${s.frame} ${className ?? ""}`}
      data-shot={shot.id}
      style={{ width: shot.cssWidth, height: shot.cssHeight }}
    >
      {children}
    </section>
  );
}

/** 見出しチップの実牌（LP の四風チップと同じ流儀）。null は「?」の要確認牌。 */
function KickerTile({ code }: { code: Tile | null }) {
  const style = { "--pt-h": "30px" } as CSSProperties;
  return (
    <span
      className={`${s.kickerTile} ${code === null ? s.unknown : ""}`}
      style={style}
      aria-hidden="true"
    >
      <OssTileFace code={code} />
      {code === null ? <i className={s.unknownQ}>?</i> : null}
    </span>
  );
}

/** プロモ用の牌列（面は実部品 OssTileFace。寸法はフレーム幅に合わせて可変）。 */
function PromoTiles({
  tiles,
  tileW,
  gap = 5,
  pickIndex,
}: {
  tiles: readonly (Tile | null)[];
  tileW: number;
  gap?: number;
  pickIndex?: number;
}) {
  const style = {
    gap,
    "--pt-w": `${tileW}px`,
    "--pt-h": `${Math.round(tileW * 1.38)}px`,
  } as CSSProperties;
  return (
    <div className={s.tiles} style={style} aria-hidden="true">
      {tiles.map((code, i) => (
        <span key={i} className={`${s.tile} ${i === pickIndex ? s.pick : ""}`}>
          <OssTileFace code={code} />
        </span>
      ))}
    </div>
  );
}

/** 実部品 ViewBoard（テーマ変数は LP と同じ boardVars をローカル供給）。 */
function Board({
  scale,
  highlight = null,
}: {
  scale: number;
  /** 振り返りフレームで強調する河の1枚（ViewBoard の highlightRiver）。 */
  highlight?: { seat: "east" | "south" | "west" | "north"; index: number } | null;
}) {
  return (
    <div className={`${land.boardVars} ${land.boardWrap}`}>
      <ViewBoard
        kifu={BOARD_KIFU}
        bottomSeat="east"
        dealer="east"
        scale={scale}
        hideOpp
        highlightRiver={highlight}
        center={
          <div className={land.boardCenter}>
            <span>東一局</span>
          </div>
        }
      />
    </div>
  );
}

/** AI 検出のコーナーマーク + 静止スキャンライン（撮影用に animation は使わない）。 */
function ScanMarks() {
  return (
    <>
      <i className={`${s.corner} ${s.cTL}`} aria-hidden="true" />
      <i className={`${s.corner} ${s.cTR}`} aria-hidden="true" />
      <i className={`${s.corner} ${s.cBL}`} aria-hidden="true" />
      <i className={`${s.corner} ${s.cBR}`} aria-hidden="true" />
      <div className={s.scanline} aria-hidden="true" />
    </>
  );
}

/** 特訓フレームの統計タイル（数字で埋める主役級ビジュアルの一部）。 */
function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className={s.stat}>
      <span className={s.statV}>
        {value}
        {unit ? <small>{unit}</small> : null}
      </span>
      <span className={s.statL}>{label}</span>
    </div>
  );
}

/** ストア1面ぶんの6フレーム（iOS / Play は寸法・文字サイズだけ違う同一構成）。 */
function StoreFrames({ store }: { store: "ios" | "play" }) {
  const cfg =
    store === "ios"
      ? { cls: "", boardScale: 0.51, handTileW: 28, vTileW: 40 }
      : { cls: s.play, boardScale: 0.416, handTileW: 22, vTileW: 34 };
  return (
    <>
      {/* 3. ヒーロー: 撮るだけで牌譜になる（句点はこの一文だけ。旧 review の振り返り訴求はチップへ統合） */}
      <Frame id={`${store}-capture`} className={cfg.cls}>
        <div className={s.inner}>
          <div>
            <p className={s.kicker}>
              <KickerTile code="1z" />
              牌譜
            </p>
            <h2 className={s.headline}>
              麻雀の記録を
              <br />
              <em>撮るだけ</em>で。
            </h2>
            <p className={s.sub}>卓の写真から、AI が盤面を再現</p>
          </div>
          <div className={s.vis}>
            <div className={`${s.panel} ${s.scan}`}>
              <ScanMarks />
              <Board scale={cfg.boardScale} />
            </div>
            <div className={s.chips}>
              <span className={s.chip}>気になる一打から何切るを作れる</span>
              <span className={s.chip}>Mリーグ・天鳳ルール対応</span>
            </div>
          </div>
        </div>
      </Frame>

      {/* 3. 公開・共有: リンクひとつ（実 OGP デザインの埋め込みカード） */}
      <Frame id={`${store}-share`} className={cfg.cls}>
        <div className={s.inner}>
          <div>
            <p className={s.kicker}>
              <KickerTile code="2z" />
              公開・共有
            </p>
            <h2 className={s.headline}>
              牌譜を送って
              <br />
              <em>みんなで何切る</em>
            </h2>
            <p className={s.sub}>送った相手も、牌譜を見て何切るを解ける</p>
          </div>
          <div className={s.vis}>
            {/* 共有リンクが会話のネタになる、をチャット風モックで見せる。
                リンクカードは実 OGP デザイン（/k の opengraph-image と同じ構図）。 */}
            <div className={s.chat} aria-hidden="true">
              <div className={s.bubbleCard}>
                <div className={land.embed}>
                  <div className={land.embedImg}>
                    <div className={land.embedBrand}>
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                        <path d={STAR_PATH} fill={STAR_COLOR} />
                      </svg>
                      <span>{BRAND}</span>
                    </div>
                    <div className={land.embedTitle}>東京リーグ戦 2回戦</div>
                    <div className={land.embedInfo}>南四局 ・ 8局</div>
                  </div>
                  <div className={land.embedMeta}>
                    <span className={land.embedDomain}>{siteHost()}</span>
                    <span
                      className={land.embedText}
                    >{`東京リーグ戦 2回戦 ・ 麻雀牌譜 | ${BRAND}`}</span>
                  </div>
                </div>
              </div>
              <div className={`${s.bubble} ${s.bubbleL}`}>
                牌譜見た！南2局の追っかけリーチ、しびれた
              </div>
              <div className={`${s.bubble} ${s.bubbleR}`}>あの一打は何切るにした — 解いてみて</div>
              <div className={`${s.bubble} ${s.bubbleL}`}>解いたよ、八萬切り 58% は意外</div>
            </div>
            <div className={s.chips}>
              <span className={s.chip}>見るだけならサインイン不要</span>
              <span className={s.chip}>公開・非公開は半荘ごとに選べる</span>
            </div>
          </div>
        </div>
      </Frame>

      {/* 4. 何切る: みんなの答えと比べる */}
      <Frame id={`${store}-nanikiru`} className={cfg.cls}>
        <div className={s.inner}>
          <div>
            <p className={s.kicker}>
              <KickerTile code="3z" />
              何切る
            </p>
            <h2 className={s.headline}>
              その一打
              <br />
              <em>みんなの答え</em>と比べる
            </h2>
            <p className={s.sub}>牌譜の一場面から、1タップで出題</p>
          </div>
          <div className={s.vis}>
            {/* 枠なしで問いと牌姿だけ。牌は横倒しの縦一列で画面の縦長を活かす
                （答え・選択・分布は見せない。オーナー指定 2026-07-31）。 */}
            <div className={s.vquiz}>
              <span className={s.vq}>何切る？</span>
              <div className={s.vhand} aria-hidden="true">
                {NANIKIRU_HAND.map((code, i) => (
                  <span
                    key={i}
                    className={s.vtile}
                    style={
                      {
                        "--vt-w": `${cfg.vTileW}px`,
                        "--vt-h": `${Math.round(cfg.vTileW * 1.38)}px`,
                      } as CSSProperties
                    }
                  >
                    <span className={s.vtileIn}>
                      <OssTileFace code={code} />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Frame>

      {/* 5. 特訓: 60秒タイムアタックと伸びのグラフ（実部品 QuizLineChart） */}
      <Frame id={`${store}-training`} className={cfg.cls}>
        <div className={s.inner}>
          <div>
            <p className={s.kicker}>
              <KickerTile code="4z" />
              特訓
            </p>
            <h2 className={s.headline}>
              60秒で
              <br />
              <em>最速の判断</em>
            </h2>
            <p className={s.sub}>清一色・牌効率・点数計算 — 伸びは毎日グラフになる</p>
          </div>
          <div className={s.vis}>
            {/* 出題例: 清一色 何待ち。枠なしで問いと牌姿だけ（答えは見せない。オーナー指定 2026-07-31）。 */}
            <div className={s.qfree}>
              <span className={s.qhead}>和了牌を選ぶ</span>
              <PromoTiles tiles={CHINITSU_HAND} tileW={cfg.handTileW} gap={2} />
            </div>
            {/* 数字は主役級ビジュアルの一部（正答数・正答率。オーナー指定 2026-07-31）。 */}
            <div className={s.statRow}>
              <Stat value="16" unit="問" label="正答数" />
              <Stat value="80" unit="%" label="正答率" />
            </div>
            <QuizLineChart points={TRAINING_POINTS} title="清一色 何待ち" meta="直近2週間の伸び" />
          </div>
        </div>
      </Frame>

      {/* 6. 締め: 無料の範囲とプラン */}
      <Frame id={`${store}-free`} className={cfg.cls}>
        <div className={s.inner}>
          <div>
            <div className={s.brandRow}>
              <BrandMark starClassName={s.brandStar} wordmarkClassName={s.brandWm} />
            </div>
            <h2 className={s.headline} style={{ textAlign: "center" }}>
              まずは
              <br />
              <em>無料</em>ではじめる
            </h2>
          </div>
          <div className={s.vis}>
            <div className={s.planList}>
              <div className={s.planRow}>
                <span className={s.planName}>
                  Free
                  <span className={s.planDesc}>閲覧・何切る回答・特訓・手入力の牌譜</span>
                </span>
                <span className={s.planPrice}>
                  ¥0<small> / 月</small>
                </span>
              </div>
              {/* ストア画像なのでアプリ内課金（IAP）のストア掲載価格を出す。
                  web=Stripe は ¥480/¥1,480 で異なる（設計ドキュメント7章）。LP は web 価格。 */}
              <div className={`${s.planRow} ${s.planHot}`}>
                <span className={s.planBadge}>おすすめ</span>
                <span className={s.planName}>
                  {`${BRAND} Next`}
                  <span className={s.planDesc}>AI 再現 月100回 ・ 保存無制限</span>
                </span>
                <span className={s.planPrice}>
                  ¥700<small> / 月</small>
                </span>
              </div>
              <div className={s.planRow}>
                <span className={s.planName}>
                  {`${BRAND} Pro`}
                  <span className={s.planDesc}>AI 再現 月320回 ・ 保存無制限</span>
                </span>
                <span className={s.planPrice}>
                  ¥1,800<small> / 月</small>
                </span>
              </div>
            </div>
            <div className={s.chips} style={{ justifyContent: "center" }}>
              <span className={s.chip}>プランはいつでも変更できます</span>
            </div>
          </div>
        </div>
      </Frame>
    </>
  );
}

/** Play のフィーチャーグラフィック（1024×500。雰囲気とブランドを伝えるバナー）。 */
function FeatureFrame() {
  return (
    <Frame id="feature">
      <div className={s.featureInner}>
        <div className={s.featureCopy}>
          <div className={s.featureBrand}>
            <BrandMark starClassName={s.brandStar} wordmarkClassName={s.brandWm} />
          </div>
          <h2 className={s.headline}>
            麻雀の記録を、<em>撮るだけ</em>で。
          </h2>
          <p className={s.sub}>残す・振り返る・出題する・鍛えるまで、これひとつ</p>
        </div>
        <div className={`${s.panel} ${s.featureBoard}`}>
          <Board scale={0.5} />
        </div>
      </div>
    </Frame>
  );
}

export default function DevPromoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className={`${s.page} themeApp`}>
      {/* サイト本体は Web フォントを使わないが、ストア画像は環境差の出ない字形で
          焼き付けたいので、このフィクスチャに限り Noto Sans JP を読み込む。 */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap"
      />
      <p className={s.pageNote}>
        ストア用プロモ画像のフィクスチャ（撮影は apps/web で pnpm shots → docs/store-assets/
        に出力）
      </p>
      <StoreFrames store="ios" />
      <StoreFrames store="play" />
      <FeatureFrame />
    </div>
  );
}
