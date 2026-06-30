import { StarMark } from "./StarMark";

/**
 * ブランド表示（オレンジ5角星 + ワードマーク "RIGEL"）。
 * 寸法・字間は画面ごとに異なるため、ラッパ（.brand）と各 className は
 * 呼び出し側で与える（このコンポーネントは構造とワードマーク文字列を一元化する）。
 * 盤面エディタの白い4角星マークは別意匠のため対象外。
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
      <span className={wordmarkClassName}>RIGEL</span>
    </>
  );
}
