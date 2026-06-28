# rigel — 麻雀 牌譜サイト

実物の麻雀卓を撮った写真から、**牌譜（盤面）のドラフトを自動生成**し、ユーザーが確信度の低い箇所を
修正・保存・共有できるサービス。AI（Gemini）の読み取り精度を、足場（前処理・スキーマ・検証）で引き上げる。

- **構想・スコープ（why/what）** … [docs/mahjong-kifu-app-design.md](docs/mahjong-kifu-app-design.md)（単一真実源）
- **進め方（how）** … [docs/開発ガイド/](docs/開発ガイド/README.md)（ハーネスエンジニアリング / TDD / 計画 / 検証）
- **エージェントの起点** … [CLAUDE.md](CLAUDE.md)

## モノレポ構成

```
packages/
  schema/   @rigel/schema  牌譜スキーマ(Zod)。全層共有の背骨。AI出力検証もこれ
  ui/       @rigel/ui      牌SVG・confidenceハイライト・修正UI（RN/Web共有）※M6
apps/
  api/      api            Cloudflare Workers（Hono + Drizzle + D1）。DDD レイヤード
  web/      web            Next.js（App Router）。背骨スキーマ・UIを共有
  mobile/   mobile         React Native (Expo)。背骨スキーマ・UIを共有
```

`api` の構成は [05 APIアーキテクチャ](docs/開発ガイド/05_APIアーキテクチャ.md) を参照。
`web` / `mobile` は土台のみ（共有パッケージの利用デモ）。画面実装は後続。

## 開発コマンド

```bash
pnpm install          # 依存
pnpm typecheck        # 全パッケージ tsc --noEmit
pnpm lint             # ESLint
pnpm format:check     # Prettier（差分ゼロ）
pnpm test             # Vitest
pnpm build            # ビルド（schema の dist など）
```

アプリ別の起動:

```bash
pnpm --filter web dev          # Next.js 開発サーバ
pnpm --filter mobile start     # Expo（QR / シミュレータ）
pnpm --filter api dev          # Workers（wrangler dev）
```

ゲートの詳細は [docs/開発ガイド/04_検証とCIゲート.md](docs/開発ガイド/04_検証とCIゲート.md)。
CI（GitHub Actions）は `.github/workflows/ci.yml` で同じゲートを回す。

## 必要環境

Node.js >= 20 / pnpm 10。ツールチェーンは TypeScript 一気通貫（Vitest / ESLint / Prettier / turborepo）。
