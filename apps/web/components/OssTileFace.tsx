import type { Tile } from "@rigel/schema";
import { tileAssetName, tileLabel } from "@rigel/ui";

/**
 * OSS 牌の面（FluffyStuff: Front + シンボルの2枚重ね）。code が null なら Front のみ。
 * 盤面エディタ・閲覧ビューア・ピッカーで共通の描画原子。
 */
export function OssTileFace({ code }: { code: Tile | null }) {
  const asset = code ? tileAssetName(code) : null;
  return (
    <>
      <img src="/tiles/Front.svg" alt="" />
      {asset ? <img src={`/tiles/${asset}.svg`} alt={tileLabel(code)} /> : null}
    </>
  );
}
