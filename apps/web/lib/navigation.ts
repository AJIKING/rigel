// 外部オリジン（Stripe Checkout / Billing Portal など）へのフル遷移。
// next/navigation の router は外部URLを扱えないため window.location を使う。
// jsdom は location を再定義できず遷移先を観測できないので、テストは
// このモジュールを差し替えて遷移先URLを検証する（課金導線の回帰テスト用シーム）。
export function redirectTo(url: string): void {
  window.location.href = url;
}
