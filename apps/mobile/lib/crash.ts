// クライアントエラー計測（Firebase Crashlytics）。実機で起きた JS エラーを
// ダッシュボードで見られるようにする（2026-08-01 の実機障害＝catch が握りつぶして
// 手掛かりゼロ、の再発防止）。Plan: docs/plans/crashlytics.md
// - 文脈は @rigel/ui の固定語彙のみ（自由文字列＝PII 混入経路を型で締め出す）
// - dev（__DEV__）では送らない
// - **計測がアプリを壊してはならない**: どんな失敗も外へ投げない（no-throw 保証）
// ネイティブモジュールのため Expo Go では動かない（dev build / Codemagic 必須）。

import { getCrashlytics, recordError, setAttributes } from "@react-native-firebase/crashlytics";
import type { CrashContext } from "@rigel/ui";

/** __DEV__ をビルド時定数ではなく実行時に読む（テストから差し替えるため。
 *  RN 実行時は globalThis に生えている）。 */
function isDev(): boolean {
  return (globalThis as { __DEV__?: boolean }).__DEV__ === true;
}

/** エラーを Crashlytics に記録する（表示・挙動は一切変えない計測のみ）。 */
export function trackError(e: unknown, context: CrashContext): void {
  if (isDev()) return;
  try {
    const crash = getCrashlytics();
    // カスタムキー（screen/op）でダッシュボード上の絞り込みを可能にする。
    // 属性書き込みの失敗は握りつぶす（記録本体 recordError は続行）。
    void setAttributes(crash, { screen: context.screen, op: context.op }).catch(() => undefined);
    recordError(
      crash,
      e instanceof Error ? e : new Error(String(e)),
      // jsErrorName = ダッシュボードのグルーピング名（minify 後の Error 名の代わり）。
      `${context.screen}:${context.op}`,
    );
  } catch {
    // no-throw 保証（Firebase 未初期化・ネイティブ不在などでも本体機能を守る）。
  }
}
