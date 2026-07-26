// お気に入り（★）の重ね合わせ（web/mobile 共有のヘッドレスモデル）。
//
// お気に入りは**サーバー保存**（[決定] 2026-07-26）なので、状態はカード自身
// （viewerFaved / favoriteCount）が持つ。画面で押した分はサーバー確定を待たずに
// 見た目へ反映したい（楽観更新）ので、「この画面での操作」を差分として別に持ち、
// 描画・絞り込み・並べ替えの直前に重ねる。
//
// 保存先（web=Server Action / mobile=Bearer で API）と永続化（localStorage /
// SecureStore）はプラットフォームで違うが、**重ね合わせの規則は同じ**なのでここに置く
// （ukeireReviewModel・quizSessionReducer と同じ「純粋な芯を共有する」方針）。

/** 重ね合わせに必要な、カードの最小の形。 */
export interface FavoriteCard {
  id: string;
  favoriteCount: number;
  viewerFaved: boolean;
}

/** この画面で押した分（サーバー確定前の楽観状態）。 */
export interface FavoriteOverride {
  /** 押した結果の状態（＝サーバーへ送るべき値）。 */
  faved: boolean;
  /** サーバーの favoriteCount に足す差分（+1 / -1 / 0）。 */
  delta: number;
}

/** targetId → この画面での操作。 */
export type FavoriteOverrides = ReadonlyMap<string, FavoriteOverride>;

/**
 * カード配列に操作を重ねて返す（絞り込み・並べ替えはこの結果の上で行う）。
 * 操作が1つも無いときは中身を作り替えない。
 */
export function applyFavoriteOverrides<T extends FavoriteCard>(
  cards: readonly T[],
  overrides: FavoriteOverrides,
): T[] {
  if (overrides.size === 0) return [...cards];
  return cards.map((c) => {
    const o = overrides.get(c.id);
    if (!o) return c;
    // サーバー値が古い（他端末で先に外された等）と負になり得るので下限を切る。
    return { ...c, viewerFaved: o.faved, favoriteCount: Math.max(0, c.favoriteCount + o.delta) };
  });
}

/** 1枚のカードの★を反転した新しい操作 Map（入力は変更しない）。 */
export function toggleFavoriteOverride(
  overrides: FavoriteOverrides,
  card: FavoriteCard,
): Map<string, FavoriteOverride> {
  const current = overrides.get(card.id);
  const wasFaved = current ? current.faved : card.viewerFaved;
  const next = new Map(overrides);
  // delta は「押した回数の積み上げ」。2回押せば 0 に戻り、サーバー値がそのまま出る。
  next.set(card.id, { faved: !wasFaved, delta: (current?.delta ?? 0) + (wasFaved ? -1 : 1) });
  return next;
}

/** サーバーが失敗したときに、押す前の状態（before）へ戻した新しい操作 Map。 */
export function rollbackFavoriteOverride(
  overrides: FavoriteOverrides,
  targetId: string,
  before: FavoriteOverride | undefined,
): Map<string, FavoriteOverride> {
  const back = new Map(overrides);
  if (before) back.set(targetId, before);
  else back.delete(targetId);
  return back;
}
