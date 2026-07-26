// rigel モバイルのデザイントークン。docs/rigel-mobile4.html の :root 変数を単一の出所とする。
// 色・角丸・字体をここに集約し、各コンポーネントは値をハードコードせずここから参照する。

export const colors = {
  bg: "#0f1115",
  bgDeep: "#0a0b0d",
  chrome: "#16181d",
  chrome2: "#1d2027",
  chrome3: "#23262e",
  line: "rgba(255,255,255,0.12)",
  line2: "rgba(255,255,255,0.07)",
  white: "#f5f6f7",
  w70: "rgba(245,246,247,0.66)",
  /** 二次テキスト。0.42 は #0f1115 上で 3.35:1（AA 未達）だったので引き上げた
   *  （[決定] 2026-07-26。0.55 で 5.8:1）。 */
  w45: "rgba(245,246,247,0.55)",
  em: "#0c7a57",
  emDeep: "#0a5f44",
  /** 正解・プラス点の緑。web の --em-light と同値に統一（[決定] 2026-07-26。
   *  以前は #1aa078 で web と別色だった。ダーク地で 8.6:1）。 */
  emLite: "#3ec487",
  bone: "#f5eee0",
  boneEdge: "#dccdab",
  accent: "#ff9e45",
  accent2: "#ff7d33",
  accentSoft: "rgba(255,158,69,0.14)",
  /** 塗り/枠の赤（バッジ・削除ボタン）。 */
  vermilion: "#e24b3a",
  /** ダーク面のエラー文字。vermilion は本文として 4.8:1 と弱いので明るい側を使う。 */
  danger: "#ffb4a8",
} as const;

export const radius = {
  sm: 2,
  base: 3,
  card: 10,
} as const;

// M PLUS Rounded 1c は端末に無い場合があるため、見出しは system の太字にフォールバックする。
// （Expo でカスタムフォントを読み込むまではプラットフォーム標準を使う。）
export const fonts = {
  round: undefined as string | undefined, // 見出し用（将来 M PLUS Rounded を差す）
} as const;
