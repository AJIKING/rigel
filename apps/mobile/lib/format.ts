/** ISO日時を日付(YYYY-MM-DD)に。 */
export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}
