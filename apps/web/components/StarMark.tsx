/** RIGEL のブランドマーク（5角のオレンジ星）。サイズは className で指定。 */
export function StarMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 1.6l2.7 6.9 7.4.4-5.8 4.6 2 7.1L12 16.9 5.7 20.6l2-7.1L1.9 8.9l7.4-.4z"
        fill="#ff9e45"
      />
    </svg>
  );
}
