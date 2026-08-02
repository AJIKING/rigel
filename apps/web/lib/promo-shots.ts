/**
 * ストア用プロモーション画像（スクリーンショット）のマニフェスト。
 * /dev/promo（描画）と shots/（Playwright 撮影）とテストが同じ一覧を共有する。
 *
 * 出力ピクセル = CSS px × deviceScaleFactor:
 * - iOS   : 440×956 @3x → 1320×2868（App Store 6.9インチの推奨サイズ）
 * - Play  : 360×800 @3x → 1080×2400（9:16。Play の許容範囲内）
 * - feature: 1024×500 @1x（Play フィーチャーグラフィックの固定サイズ）
 */
export type PromoShot = {
  /** /dev/promo のフレーム要素に付く data-shot 値。 */
  id: string;
  /** フレームの CSS ピクセル寸法（撮影時に実測と一致していること）。 */
  cssWidth: number;
  cssHeight: number;
  /** 撮影コンテキストの deviceScaleFactor（出力ピクセルの倍率）。 */
  deviceScaleFactor: 1 | 3;
  /** docs/store-assets/ 配下の出力先。 */
  file: string;
};

/** フレームの種類（両ストア共通の5枚構成。順序 = ストア掲載順）。
 *  [決定] 2026-07-31 オーナー: インストールのきっかけはクイズ・何切る。
 *  検索結果で見える先頭2〜3枚をクイズ系にし、独自機能（撮るだけ）は3枚目に置く。
 *  旧 review（振り返り）は capture と盤面ビジュアルが重複するため統合した。 */
export const PROMO_FRAMES = ["nanikiru", "training", "capture", "share", "free"] as const;
export type PromoFrame = (typeof PROMO_FRAMES)[number];

const IOS = { cssWidth: 440, cssHeight: 956, deviceScaleFactor: 3 as const };
const PLAY = { cssWidth: 360, cssHeight: 800, deviceScaleFactor: 3 as const };

export const PROMO_SHOTS: PromoShot[] = [
  ...PROMO_FRAMES.map((frame, i) => ({
    id: `ios-${frame}`,
    ...IOS,
    file: `ios/0${i + 1}-${frame}.png`,
  })),
  ...PROMO_FRAMES.map((frame, i) => ({
    id: `play-${frame}`,
    ...PLAY,
    file: `play/0${i + 1}-${frame}.png`,
  })),
  {
    id: "feature",
    cssWidth: 1024,
    cssHeight: 500,
    deviceScaleFactor: 1,
    file: "play/feature-graphic.png",
  },
];
