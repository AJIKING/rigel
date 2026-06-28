# .claude — rigel 開発ハーネス（Claude Code 資産）

Claude Code がこのプロジェクトで使うコマンド・エージェント・設定を置く場所。
全体の進め方は [../docs/開発ガイド/](../docs/開発ガイド/README.md)、エージェントの起点は [../CLAUDE.md](../CLAUDE.md)。

## スラッシュコマンド（`commands/`）

| コマンド | 用途 |
|---|---|
| `/plan <機能>` | Plan を作り、合意してから着手する（実装は書かない） |
| `/tdd <振る舞い>` | 1つの振る舞いを Red→Green→Refactor で実装 |
| `/gate` | 検証ゲート（typecheck / lint / format / test）を実行し報告 |
| `/trust-check <対象>` | AI出力・課金・プライバシーに触れるコードの信頼ゲートを監査 |

## サブエージェント（`agents/`）

| エージェント | 用途 |
|---|---|
| `tdd-implementer` | 厳格な TDD で1つの振る舞いを実装（委譲先） |
| `trust-auditor` | Zod検証 / 推測しない / confidence / 課金整合 / 画像非保存 を読み取り専用で監査 |
| `harness-reviewer` | ハーネスエンジニアリング原則に照らして設計レビュー |

呼び出し例: 「trust-auditor で解析パイプラインを監査して」のように依頼するか、Claude が自動委譲する。

## 設定（`settings.json`）

- `permissions.allow`: `pnpm`（test/lint/typecheck/build）、`tsc`、`vitest`、`eslint`、`prettier`、`wrangler` などの検証コマンドを許可。
- `permissions.ask`: `git push` / `git commit` は都度確認。
- `permissions.deny`: `.env` や鍵ファイルの読み取りを禁止（AI の API キー保護）。
- `settings.local.json` は各自のローカル上書き用（gitignore 済み・コミットしない）。

## 標準ワークフロー

```
/plan 機能X        → Plan に合意（[決定]/[未確定] を仕分け）
  └ /tdd 振る舞い1  → Red→Green→Refactor（AI出力を扱うなら tdd-implementer + trust-auditor）
  └ /tdd 振る舞い2
/gate              → 全ゲート通過を確認
（必要なら）/trust-check, harness-reviewer でレビュー
```

> rigel の主役は **AI（Gemini）の読み取り精度**。便利機能より「誤読を断定しない・スキーマで検証する・課金を誤らない・画像を保存しない」を優先する。
