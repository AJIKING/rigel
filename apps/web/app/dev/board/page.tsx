"use client";

import { KifuSchema, type Kifu, type Seat, type Tile } from "@rigel/schema";
import { notFound } from "next/navigation";
import { type PublicGameDetail } from "../../../lib/api";
import { KifuViewer } from "../../../components/view/KifuViewer";

// レイアウト検証（Playwright）専用のフィクスチャ画面。満河・満貫の盤面を
// api なしで描画し、牌が席をまたいで重ならないことを実ブラウザで測る。
// 本番には出さない（NODE_ENV=production では 404）。

const RIVER: Tile[] = [
  "1m",
  "9m",
  "1p",
  "9p",
  "1s",
  "9s",
  "1z",
  "2z",
  "3z",
  "4z",
  "5z",
  "6z",
  "7z",
  "2m",
  "8m",
  "2p",
  "8p",
  "2s",
  "8s",
  "3m",
  "7m",
  "3p",
  "7p",
  "3s",
];
const HAND: Tile[] = ["1m", "2m", "3m", "4m", "5m", "6m", "7m", "8m", "9m", "1p", "2p", "3p", "4p"];

function seatBoard() {
  return {
    hand: HAND.map((tile) => ({ tile, confidence: 1 })),
    river: RIVER.map((tile, i) => ({
      order: i + 1,
      tile,
      riichi: i === 5,
      tsumogiri: i % 3 === 0,
      confidence: 1,
    })),
    melds: [
      {
        type: "pon" as const,
        tiles: [
          { tile: "5z" as Tile, confidence: 1 },
          { tile: "5z" as Tile, confidence: 1 },
          { tile: "5z" as Tile, confidence: 1 },
        ],
        from: null,
      },
    ],
  };
}

function fullKifu(): Kifu {
  const seats = {
    east: seatBoard(),
    south: seatBoard(),
    west: seatBoard(),
    north: seatBoard(),
  } as Record<Seat, ReturnType<typeof seatBoard>>;
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    result: "ron",
    meta: { dealer: "east", honba: 1, dora: "5z", junme: 18 },
    seats,
  });
}

const DETAIL: PublicGameDetail = {
  game: { id: "dev", title: "レイアウト検証（満河）", createdAt: "2026-06-28T00:00:00.000Z" },
  owner: { id: "dev", handle: "dev", displayName: "dev" },
  logs: [
    {
      id: "dev-log",
      userId: "dev",
      gameId: "dev",
      seq: 1,
      kifu: fullKifu(),
      visibility: "public",
      createdAt: "2026-06-28T00:00:00.000Z",
    },
  ],
};

export default function DevBoardPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <KifuViewer detail={DETAIL} gameId="dev" />;
}
