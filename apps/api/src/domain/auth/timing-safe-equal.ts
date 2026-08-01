/** 文字列の定数時間比較（共有シークレットの照合に使う。長さの違いも早期 return しない）。
 *  RevenueCat Webhook（interfaces）と審査用ログイン（application）で共用するため domain に置く。 */
export function timingSafeEqual(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  // 長さが違っても同じ回数だけ比較する（長さ自体は秘密ではない）。
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
