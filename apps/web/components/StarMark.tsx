/** 星形ジオメトリと色の単一ソース（OG画像など className が効かない描画先とも共有）。 */
export const STAR_PATH =
  "M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z";
export const STAR_COLOR = "#ff9e45";

/** RAISHA のブランドマーク（5角のオレンジ星）。サイズは className で指定。 */
export function StarMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d={STAR_PATH} fill={STAR_COLOR} />
    </svg>
  );
}
