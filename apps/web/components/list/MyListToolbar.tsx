"use client";

import { A11Y_LABELS, MY_LIST_SORTS, type MyListSortKey } from "@rigel/ui";
import s from "./kifu-list.module.css";

/** 状態（公開/非公開・公開/下書き）の選択肢。中身はタブごとに違うが並びと形は共通。 */
export interface StatusOption {
  value: string;
  label: string;
}

/**
 * マイページ（牌譜 / 何切る / お気に入り）で共通のツールバー。
 * 「検索・状態・並び替え・★お気に入りのみ・＋新規」を同じ順序・同じ見た目に揃える
 * （[決定] 2026-07-26。タブごとに絞り込みの有無や並びが違うと、同じマイページなのに
 * 操作を覚え直すことになるため）。お気に入りは状態セレクトに混ぜず独立トグルにして、
 * 「公開かつお気に入り」のような掛け合わせができるようにする。
 * お気に入りタブは onFavOnly を渡さない＝トグル自体を出さない
 * （[決定] 2026-07-29。常にお気に入りのみのタブでは無意味。mobile と統一）。
 */
export function MyListToolbar({
  q,
  onQ,
  searchLabel,
  searchPlaceholder,
  statusLabel,
  statusOptions,
  status,
  onStatus,
  sort,
  onSort,
  favOnly,
  onFavOnly,
  onNew,
  newDisabled,
}: {
  q: string;
  onQ: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  /** 状態セレクト。省略（空配列）ならセレクト自体を出さない（お気に入りタブ）。 */
  statusLabel: string;
  statusOptions: readonly StatusOption[];
  status: string;
  onStatus: (value: string) => void;
  sort: MyListSortKey;
  onSort: (value: MyListSortKey) => void;
  /** お気に入りのみ表示。onFavOnly を省略するとトグル自体を出さない（お気に入りタブ）。 */
  favOnly?: boolean;
  onFavOnly?: (value: boolean) => void;
  /** ＋新規。省略すればボタンを出さない。 */
  onNew?: () => void;
  newDisabled?: boolean;
}) {
  return (
    <div className={s.toolbar}>
      <div className={s.search}>
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4-4" />
        </svg>
        <input
          type="search"
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          value={q}
          onChange={(e) => onQ(e.target.value.trim())}
        />
      </div>

      {statusOptions.length > 0 && (
        <div className={s.sortwrap}>
          <select
            aria-label={statusLabel}
            value={status}
            onChange={(e) => onStatus(e.target.value)}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className={s.sortwrap}>
        <select
          aria-label={A11Y_LABELS.sort}
          value={sort}
          onChange={(e) => onSort(e.target.value as MyListSortKey)}
        >
          {MY_LIST_SORTS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* お気に入りのみ（状態セレクトと掛け合わせられる独立トグル）。
          読み上げ名は「お気に入りのみ表示」。カードの★（名前は「お気に入り」）と
          区別できるようにしつつ、見えている文字を名前に含める（label in name）。 */}
      {onFavOnly ? (
        <button
          type="button"
          className={s.favbtn}
          aria-label={A11Y_LABELS.favoriteOnly}
          aria-pressed={favOnly}
          onClick={() => onFavOnly(!favOnly)}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z" />
          </svg>
          お気に入り
        </button>
      ) : null}

      {onNew && (
        <button className={s.newbtn} disabled={newDisabled} onClick={onNew}>
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          新規
        </button>
      )}
    </div>
  );
}
