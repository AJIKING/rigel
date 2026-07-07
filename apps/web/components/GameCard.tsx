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
 * 一覧カード（牌譜のマイページ・公開・ユーザーページ・何切るで共通）。
 * meta は行内の説明、badge は任意（公開/非公開バッジ等）、actions は
 * カード内の操作ボタン列（何切るの公開切替・削除等。クリックはカード遷移に伝播しない）。
 */
export function GameCard({
  title,
  badge,
  meta,
  faved,
  onToggleFav,
  onOpen,
  actions,
}: {
  title: string;
  badge?: ReactNode;
  meta: ReactNode;
  faved: boolean;
  onToggleFav: () => void;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  // カードは中に <button>（お気に入り）を含むため、<button> ではなく role=button の
  // クリック可能な要素にする（button の入れ子は不正で hydration エラーになる）。
  return (
    <div
      className={s.card}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <FavButton on={faved} onToggle={onToggleFav} />
      <Thumb />
      <div className={s.ctop}>
        <h3 className={s.ctitle}>{title}</h3>
        {badge}
      </div>
      <div className={s.cmeta}>{meta}</div>
      {actions && (
        <div className={s.cacts} onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
