import { favoriteLabel } from "@rigel/ui";
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

/** お気に入りボタン。件数は 1 以上のときだけ添える（0 を並べても情報にならない）。
 *  件数はサーバー保存の集計値で、「お気に入りが多い順」の並べ替えの根拠でもある。 */
function FavButton({ on, count, onToggle }: { on: boolean; count: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`${s.fav} ${on ? s.on : ""}`}
      aria-pressed={on}
      aria-label={favoriteLabel(count)}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24">
        <path d="M12 2.6l2.85 6.02 6.6.62-4.97 4.4 1.46 6.46L12 17.7 6.06 20.7l1.46-6.46-4.97-4.4 6.6-.62z" />
      </svg>
      {count > 0 && <span className={s.favn}>{count}</span>}
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
  faved = false,
  favCount = 0,
  onToggleFav,
  onOpen,
  actions,
  thumb,
}: {
  title: string;
  badge?: ReactNode;
  meta: ReactNode;
  faved?: boolean;
  /** お気に入り数（サーバー集計）。0 なら数字を出さない。 */
  favCount?: number;
  /** 省略時は★ボタン自体を出さない（お気に入り対象でないカード=解析下書き等）。 */
  onToggleFav?: () => void;
  onOpen: () => void;
  actions?: ReactNode;
  /** サムネイルの差し替え（何切る=手牌サムネ等）。省略時は卓チップ。 */
  thumb?: ReactNode;
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
        // カード自身にフォーカスがあるときだけ開く。内側のボタン（★・もう一度解析・削除）で
        // Enter を押すと、そのボタンの動作とカード遷移が同時発火してしまうため（キーは
        // click と違い stopPropagation の網に掛からない）。
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {onToggleFav && <FavButton on={faved} count={favCount} onToggle={onToggleFav} />}
      {thumb ?? <Thumb />}
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
