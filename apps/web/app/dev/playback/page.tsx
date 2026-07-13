"use client";

import { KifuSchema, type Kifu, type Tile, type TimelineEvent } from "@rigel/schema";
import { notFound } from "next/navigation";
import { type PublicGameDetail } from "../../../lib/api";
import { KifuViewer } from "../../../components/view/KifuViewer";

// 再生演出（ツモ牌のフライイン・打牌の drop-in）の実ブラウザ検証専用フィクスチャ。
// /dev/board（満河・timeline なし＝レイアウト検証）と違い、timeline を持つ編集済み
// 牌譜を api なしで描画し、手牌の推移と演出を確認する。本番には出さない（404）。

const EAST_HAND: Tile[] = [
  "1m",
  "2m",
  "3m",
  "4m",
  "5m",
  "6m",
  "7m",
  "8m",
  "9m",
  "1p",
  "2p",
  "3p",
  "4p",
];
const SOUTH_HAND: Tile[] = [
  "1s",
  "2s",
  "3s",
  "4s",
  "5s",
  "6s",
  "7s",
  "8s",
  "9s",
  "1z",
  "2z",
  "3z",
  "4z",
];

const discard = (
  seat: "east" | "south",
  draw: Tile | null,
  tile: Tile,
  over: Partial<Extract<TimelineEvent, { kind: "discard" }>> = {},
): TimelineEvent => ({
  kind: "discard",
  seat,
  draw,
  tile,
  tsumogiri: false,
  riichi: false,
  calledBy: null,
  confidence: 1,
  ...over,
});

function playbackKifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east", kyotaku: 0 },
    seats: {
      east: { hand: EAST_HAND.map((tile) => ({ tile, confidence: 1 })) },
      south: { hand: SOUTH_HAND.map((tile) => ({ tile, confidence: 1 })) },
      west: {},
      north: {},
    },
    timeline: [
      discard("east", "5p", "1m"), // 手出し（ツモ 5p が手牌に入る）
      discard("south", "5z", "1s"), // 手出し
      discard("east", "6p", "6p", { tsumogiri: true }), // ツモ切り（手牌は変わらない）
      discard("south", "6z", "2s", { riichi: true }), // リーチ宣言（供託+1）
      discard("east", "7p", "2m"), // 手出し
    ],
  });
}

const DETAIL: PublicGameDetail = {
  game: { id: "dev-playback", title: "再生演出検証", createdAt: "2026-06-28T00:00:00.000Z" },
  owner: { id: "dev", handle: "dev", displayName: "dev" },
  logs: [
    {
      id: "dev-playback-log",
      userId: "dev",
      gameId: "dev-playback",
      seq: 1,
      kifu: playbackKifu(),
      visibility: "public",
      status: "complete",
      createdAt: "2026-06-28T00:00:00.000Z",
    },
  ],
};

export default function DevPlaybackPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KifuViewer detail={DETAIL} gameId="dev-playback" />;
}
