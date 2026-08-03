// ============================================================
// application — 半荘の元写真（一覧・取得）
// ------------------------------------------------------------
// 撮影画像の恒久保存（[決定] 2026-08-03 photo-retention.md）。
// 写真は R2 の `games/{gameId}/{jobId}/{kind}` に置かれ、半荘と同じ寿命を持つ。
// 閲覧は所有者のみ（公開半荘でも露出しない）。他人・不存在は null（ルートで 404）。
// ============================================================

import {
  gameJobPrefix,
  gamePhotosPrefix,
  type AnalysisImageStore,
} from "../domain/analysis/analysis-transport";
import type { GameRepository } from "../domain/game/game.repository";
import type { ImageRef } from "../domain/kifu/analyzer";
import { findOwnedGame } from "./owned-game";

/** 写真の種類（R2 キーの末尾）。message.json 等の非写真はここに無いので一覧に混ざらない。 */
export const PHOTO_KINDS = ["river", "hand_bottom", "hand_right", "hand_top", "hand_left"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export function isPhotoKind(v: string): v is PhotoKind {
  return (PHOTO_KINDS as readonly string[]).includes(v);
}

export interface GamePhoto {
  /** どの解析ジョブの写真か（撮影1回=1ジョブ。追加解析で増える）。 */
  jobId: string;
  kind: PhotoKind;
}

export class ListGamePhotos {
  constructor(
    private readonly games: GameRepository,
    private readonly images: AnalysisImageStore,
  ) {}

  async execute(gameId: string, viewerId: string | null): Promise<GamePhoto[] | null> {
    if (!viewerId) return null;
    const game = await findOwnedGame(this.games, gameId, viewerId);
    if (!game) return null;

    const prefix = gamePhotosPrefix(gameId);
    const keys = await this.images.listKeys(prefix);
    const photos: GamePhoto[] = [];
    for (const key of keys) {
      const [jobId, name, ...rest] = key.slice(prefix.length).split("/");
      if (!jobId || !name || rest.length > 0) continue;
      if (isPhotoKind(name)) photos.push({ jobId, kind: name });
    }
    return photos;
  }
}

export class GetGamePhoto {
  constructor(
    private readonly games: GameRepository,
    private readonly images: AnalysisImageStore,
  ) {}

  async execute(params: {
    gameId: string;
    jobId: string;
    kind: PhotoKind;
    viewerId: string | null;
  }): Promise<ImageRef | null> {
    if (!params.viewerId) return null;
    const game = await findOwnedGame(this.games, params.gameId, params.viewerId);
    if (!game) return null;
    return this.images.get(`${gameJobPrefix(params.gameId, params.jobId)}${params.kind}`);
  }
}
