import { BRAND } from "../lib/brand";
import { StarMark } from "./StarMark";

/**
 * ブランド表示（オレンジ5角星 + ワードマーク）。文字列は lib/brand の BRAND が単一ソース。
 * 寸法・字間は画面ごとに異なるため、ラッパ（.brand）と各 className は呼び出し側で与える。
 */
export function BrandMark({
  starClassName,
  wordmarkClassName,
}: {
  starClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <>
      <StarMark className={starClassName} />
      <span className={wordmarkClassName}>{BRAND}</span>
    </>
  );
}
