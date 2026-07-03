/** ISO日時を日付(YYYY-MM-DD)に。 */
export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * ISO日時を「3分前 / 昨日 / 3日前 / YYYY-MM-DD」の相対表記に。
 * カードのメタ行用。`now` は主にテスト用（既定は現在時刻）。
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return fmtDate(iso);
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return "たった今";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}時間前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨日";
  if (day < 7) return `${day}日前`;
  if (day < 14) return "先週";
  if (day < 30) return `${Math.floor(day / 7)}週間前`;
  return fmtDate(iso);
}
