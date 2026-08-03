"use client";

import { ProblemSchema, PROBLEM_SCHEMA_VERSION, type Tile } from "@rigel/schema";
import { notFound } from "next/navigation";
import { ProblemAnswerScreen } from "../../../components/problem/ProblemAnswerScreen";
import { type ProblemPost } from "../../../lib/api";

// レイアウト検証（Playwright）専用のフィクスチャ画面。副露（鳴き）を含む何切るを
// api なしで描画し、横向きの牌が隣の牌と重ならないことを実ブラウザで測る。
// 本番には出さない（NODE_ENV=production では 404）。

/** 副露3つ（9枚）ぶんを引いた残りの手牌（13 - 3×3 = 4枚）。 */
const HAND_4: Tile[] = ["1m", "2m", "3m", "4m"];

/** 鳴き元ごとに横向きの位置が変わる（上家=左端・対面=中央・下家=右端）ので3種類とも置く。 */
const POST: ProblemPost = {
  id: "dev",
  userId: "dev",
  title: "レイアウト検証（副露）",
  status: "published",
  createdAt: "2026-08-03T00:00:00.000Z",
  favoriteCount: 0,
  viewerFaved: false,
  photoDraftId: null,
  problem: ProblemSchema.parse({
    schemaVersion: PROBLEM_SCHEMA_VERSION,
    kind: "discard",
    pov: "east",
    drawn: "9p",
    seats: {
      east: {
        hand: HAND_4.map((tile) => ({ tile })),
        melds: [
          { type: "pon", tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }], from: "north" },
          { type: "pon", tiles: [{ tile: "6z" }, { tile: "6z" }, { tile: "6z" }], from: "west" },
          { type: "chi", tiles: [{ tile: "2s" }, { tile: "3s" }, { tile: "4s" }], from: "south" },
        ],
      },
      south: {},
      west: {},
      north: {},
    },
    explanation: "レイアウト検証用。",
  }),
};

export default function DevProblemPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ProblemAnswerScreen post={POST} />;
}
