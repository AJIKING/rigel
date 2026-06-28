---
description: 検証ゲート（typecheck / lint / format / test）を実行し結果を報告する
allowed-tools: Bash(pnpm:*), Bash(npx tsc:*), Bash(npx vitest:*), Bash(npx eslint:*), Bash(npx prettier:*), Bash(npx wrangler:*)
---

# 検証ゲート実行

@docs/開発ガイド/04_検証とCIゲート.md のゲートを実行する。**完了＝全ゲート通過。**

## 実行（存在する範囲だけ。未導入のスタックはスキップし、その旨を明記）

### モノレポ全体（リポジトリ直下。ルートスクリプトは turbo 経由）
- `pnpm typecheck`（`tsc --noEmit`。型は最重要ゲート）
- `pnpm lint`（ESLint 警告ゼロ）
- `pnpm format:check`（Prettier 差分ゼロ。Markdown は除外＝手整形）
- `pnpm test`（Vitest。unit + integration）
- `pnpm build`

### アプリ別（必要に応じて）
- `pnpm --filter @rigel/schema test`（背骨。特に厚く）
- `pnpm --filter api test`（Workers。D1 を含むなら Miniflare/wrangler）。`web`/`mobile` は追加後に実行。

## 報告

@docs/開発ガイド/04_検証とCIゲート.md の報告フォーマットで、各ゲートの結果（PASS/FAIL と件数・警告）を示す。
1つでも FAIL なら未完了として扱い、原因と次の一手を述べる。ゲートを甘くして通したことにしない。

> AI出力・課金・プライバシーに触れる変更では、**信頼ゲート**（Zod検証 / 推測しない / confidence / 成功時のみ加算 / 画像非保存 のテスト存在）も確認する。無ければ未完了。
> AI 精度は非決定的なので合否ゲートに載せない（eval で別途）。
