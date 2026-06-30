import { type ReactNode } from "react";
import s from "./game-card.module.css";

/** 卓チップのサムネ（純CSS）。 */
export function Thumb() {
  return (
    <div className={s.thumb}>
      <i className={`${s.h} ${s.tt}`} />
      <i className={`${s.h} ${s.bb}`} />
      <i className={`${s.v} ${s.ll}`} />
      <i className={`${s.v} ${s.rr}`} />
      <i className={s.dot} />
    </div>
  );
}

function FavButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`${s.fav} ${on ? s.on : ""}`}
      aria-pressed={on}
      aria-label="お気に入り"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24">
        <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
      </svg>
    </button>
  );
}

/**
 * 牌譜一覧カード（マイページ・公開・ユーザーページ共通）。
 * meta は行内の説明、badge は任意（公開/非公開バッジ等）。
 */
export function GameCard({
  title,
  badge,
  meta,
  faved,
  onToggleFav,
  onOpen,
}: {
  title: string;
  badge?: ReactNode;
  meta: ReactNode;
  faved: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={s.card} onClick={onOpen}>
      <FavButton on={faved} onToggle={onToggleFav} />
      <Thumb />
      <div className={s.ctop}>
        <h3 className={s.ctitle}>{title}</h3>
        {badge}
      </div>
      <div className={s.cmeta}>{meta}</div>
    </button>
  );
}
