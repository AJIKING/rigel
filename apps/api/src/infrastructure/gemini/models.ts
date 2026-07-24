// infrastructure/gemini — 既定モデル名の単一定義。
// composition-root（本番）と eval runner が共有する（重複定義でモデル更改時にズレるのを防ぐ）。
// 実際の値は env（wrangler.toml の GEMINI_RIVER_MODEL / GEMINI_HAND_MODEL）で上書きされる前提で、
// ここは env 未設定時のフォールバック。モデル更改時は AI Studio で現行モデルを確認して更新する。

/** 河=難所（2.5系は新規キーで提供終了・2026-07-24 確認）。 */
export const DEFAULT_RIVER_MODEL = "gemini-3.5-flash";
/** 手牌も flash（eval 実測: flash-lite 43%/29% → flash 86%/71%。斜めに lite は力不足・2026-07-24）。 */
export const DEFAULT_HAND_MODEL = "gemini-3.5-flash";
