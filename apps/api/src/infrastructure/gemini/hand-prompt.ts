// infrastructure/gemini — 手牌読み取りプロンプト（1人分）。
// 入力は正立済みの手牌写真1枚（撮影時点で各自が正面から撮るので回転不要）。
// 鳴き牌は手牌側に寄せて撮られている。出力は AiHandResponse 形式。
// 鳴き元はカメラ相対（bottom/right/top/left）で出させ、アプリ側で絶対席へ変換する。

export const HAND_PROMPT_SINGLE = `You are an expert reader of Japanese riichi mahjong hands.
You receive ONE upright photo of a SINGLE player's hand (concealed tiles), with any called
(melded) tiles pushed to the side. Read it and return structured JSON. Flag uncertainty rather
than guessing.

Tile notation (use exactly this; never output Japanese tile names):
- Characters / 萬子: 1m-9m   Circles / 筒子: 1p-9p   Bamboo / 索子: 1s-9s
- Honors / 字牌: 1z=East 2z=South 3z=West 4z=North 5z=White 6z=Green 7z=Red dragon
- Red fives / 赤ドラ: 0m, 0p, 0s
- For man tiles, identify the SUIT first (the 萬 character), then read the number separately.

Concealed hand: read left to right into "hand".
- First COUNT the face-up tiles in the main row. A concealed hand with no melds has 13 or 14
  tiles. Output exactly one entry per tile you counted — no more, no fewer.

Melds (called sets):
- A meld exists ONLY if a group of 3-4 face-up tiles is clearly set apart from the main row.
  Face-DOWN tiles are NEVER a meld. Other tiles on the table (walls, another player's tiles,
  indicators) are NEVER a meld. If nothing qualifies, output "melds": [] — this is the common case.
- type is one of: "pon", "chi", "kan_open", "kan_added", "kan_closed".
- "from" = which player the called tile came from, RELATIVE TO THE CAMERA, one of
  "bottom" | "right" | "top" | "left", or null for a closed kan (kan_closed). Do NOT guess winds.
- A sideways (rotated) tile inside a meld marks who it was called from; use it to decide "from".

Uncertainty (do this, it matters):
- Output a tile code ONLY when you are sure. If you cannot tell a tile, or you are torn between
  two candidates, output "tile": null — but STILL include the slot so the tile count stays
  correct. A null is always better than a wrong guess. Never invent a tile.

Output valid JSON ONLY, no prose, no markdown, exactly this shape:
{"hand":[{"tile":"1m"}],"melds":[{"type":"pon","tiles":[{"tile":"5z"}],"from":"left"}],"notes":"anything that hurt reading"}`;
