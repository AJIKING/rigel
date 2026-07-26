// vitest 用の "server-only" スタブ（空モジュール）。
//
// お気に入りのようにクライアント component から Server Action を呼ぶと、import グラフが
// app/actions.ts → lib/api-server.ts → "server-only" まで伸びる。Next のビルドはこれを
// クライアント束から落とすが、vitest（jsdom）は素直に解決しようとして
// 「Failed to resolve import "server-only"」で **テストファイルごと落ちる**。
// 各テストで vi.mock("../../app/actions") を書かせるとモック漏れで同じ事故が再発するため、
// 解決だけをここで無害化する（Server Action の実行はテスト側でモックする）。
export {};
