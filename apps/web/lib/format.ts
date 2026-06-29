/** ISO日時を日付(YYYY-MM-DD)に。 */
export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}

/** ISO日時を YYYY/MM/DD に（カード表示用）。 */
export function fmtDateSlash(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, "/");
}
