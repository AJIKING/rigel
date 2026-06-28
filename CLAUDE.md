# CLAUDE.md — rigel 開発エージェント向けハーネス文脈

> このファイルは Claude Code / Codex などの開発エージェントが**毎セッションの起点として読む**永続アーティファクトです。
> 人間向けの読み物ではなく「エージェントが正しく動くための足場（harness）」として書かれています。
> 迷ったらここに戻り、ここに無い前提は勝手に作らず確認してください。

---

## 0. このプロジェクトは何か（30秒版）

**rigel** = 実物の麻雀卓を撮った写真から、**牌譜（盤面）のドラフトを自動生成**し、
ユーザーが確信度の低い箇所を修正・保存・共有できるサービス。

- コアバリュー：卓全体を撮るだけで盤面が牌譜データになる。手入力の手間をなくす。
- **AI（Gemini）の読み取り精度がサービスの成否を握る。** だから AI を取り囲む足場（前処理・スキーマ・検証）が主役。
- 全層 **TypeScript 一気通貫**。**牌譜スキーマ（Zod）が全層共有の背骨**。

詳細な構想・スコープ・技術選定は [docs/mahjong-kifu-app-design.md](docs/mahjong-kifu-app-design.md) が単一の真実源。
**設計ドキュメントと矛盾する実装はしない。** 矛盾に気づいたら実装を止めて人間に確認する。
設計ドキュメント中の **`[決定]` は確定済み、`[未確定]` は未決／要検証**。**取り違えない。**

---

## 1. 開発の二大原則（必読）

このプロジェクトは次の2つで進める。両方の詳細は [docs/開発ガイド/](docs/開発ガイド/README.md) にある。

### A. ハーネスエンジニアリング
「モデルではなくハーネス（足場）を設計する」という規律。
Gemini が正しく読むための**前処理（4分割＋正立）・出力スキーマ・検証・人手修正・精度eval**を明示的に設計する。
→ [docs/開発ガイド/01_ハーネスエンジニアリング.md](docs/開発ガイド/01_ハーネスエンジニアリング.md)

### B. テスト駆動開発（TDD）
**Red → Green → Refactor** を厳守する。**テストを書く前に実装を書かない。**
→ [docs/開発ガイド/02_TDD開発ガイド.md](docs/開発ガイド/02_TDD開発ガイド.md)

---

## 2. エージェントが守るルール（ハードルール）

1. **テストファースト。** 失敗するテスト（Red）を先に書き、それを通す最小実装（Green）だけを書く。テストの無い本番コードをコミットしない。
2. **小さく進む。** 1タスク＝1つの振る舞い。縦切り（撮影→解析→ドラフト→修正→保存の「動く一筋」）。複数の関心事を1コミットに混ぜない。
3. **スキーマが背骨。** 牌譜スキーマ（Zod）を全層が共有する。**AI 出力は使う前に必ず `*.parse()` で検証**し、検証を通っていない生レスポンスを下流に流さない。
4. **AI に推測させない。** 読めない牌は推測で埋めず `tile: null` + `confidence: 0` でスロットを残す（枚数・`order` 連番を壊さない）。全牌に confidence を持たせ、低い牌は人手修正に回す。
5. **`[決定]` と `[未確定]` を取り違えない。** 設計ドキュメントの `[未確定]`（例: `toAbsoluteSeat` の回転方向、Agentic Vision の要否）を勝手に確定して実装を進めない。要実機検証は検証してから本実装し、結論を設計ドキュメントに反映する。
6. **課金は成功時のみ。** 解析カウントは**成功時のみ +1**、失敗時は消費させない。競合で二重加算・取りこぼしを作らない。
7. **画像を保存しない。** 撮影画像は永続化しない（保存するのは解析後の `Kifu` JSON のみ）。プライバシー・ストレージ両面の前提。
8. **勝手に増やさない・固定しない。** 新ライブラリ/外部サービスは理由とともに提案し承認を得る。**Gemini のモデル名はハードコードせず**、AI Studio で現行の対応モデルを確認して使う。
9. **破壊的・外向きの操作は確認する。** `git push`、外部API送信、ファイル削除・上書きは、明示の許可なく実行しない。
10. **再現性。** 「動いた」と言うときは、実際に通したテスト／コマンドの出力を添える。憶測で完了報告しない。

---

## 3. 作業ループ（毎タスクこの順で）

```
1. 文脈確認  : 設計ドキュメント・開発ガイド・スキーマ・関連コードを読む（[決定]/[未確定]を仕分け）
2. 計画      : Plan を書く（タスク分解、検証/eval方針、影響範囲、信頼まわり）
3. Red       : 失敗するテストを書く → 失敗を確認
4. Green     : 通す最小実装を書く → テスト緑を確認
5. Refactor  : テストを緑に保ったまま整える
6. 検証      : typecheck + lint + test を通す（CIゲート相当）。AI精度は eval で別途
7. 報告      : 何を・なぜ・どう確認したかを出力（テスト出力つき）
8. 記録      : 学び／決定を設計ドキュメント・CLAUDE.md に反映（[未確定]→[決定] 更新）
```

詳細は [docs/開発ガイド/03_タスク分解とPlan運用.md](docs/開発ガイド/03_タスク分解とPlan運用.md) と
[docs/開発ガイド/04_検証とCIゲート.md](docs/開発ガイド/04_検証とCIゲート.md)。

このループは Claude Code のコマンド／エージェントで実行できる（詳細 [.claude/README.md](.claude/README.md)）:
- `/plan <機能>` → 計画して合意 ／ `/tdd <振る舞い>` → Red→Green→Refactor ／ `/gate` → 検証ゲート ／ `/trust-check` → 信頼ゲート監査
- サブエージェント: `tdd-implementer`（実装委譲）・`trust-auditor`（信頼ゲート監査）・`harness-reviewer`（設計レビュー）

---

## 4. リポジトリ構成

> M0（モノレポ土台）/ M1（スキーマ）まで構築済み。`web` / `mobile` は後続マイルストーンで追加する。
> ディレクトリを新設するときはこの計画に沿わせる。逸脱するなら先に本ファイルを更新して合意する。

```
rigel/
├── CLAUDE.md                      # ← このファイル（エージェントの起点）
├── package.json / pnpm-workspace.yaml / turbo.json / tsconfig.base.json   # モノレポ土台（M0）
├── eslint.config.mjs / .prettierrc.json / .env.example                     # ツールチェーン
├── .github/workflows/ci.yml       # CI ゲート（typecheck/lint/format/test/build）
├── .claude/                       # Claude Code 資産（コマンド/エージェント/設定）
│   ├── commands/                  # /plan /tdd /gate /trust-check
│   ├── agents/                    # tdd-implementer / trust-auditor / harness-reviewer
│   └── settings.json              # 権限（検証コマンド許可など）
├── docs/
│   ├── mahjong-kifu-app-design.md # 構想・スコープの単一真実源（why/what / [決定][未確定]）
│   ├── river_reader_prompt.md     # 河読み取りプロンプト（M3 で単方向版へ）
│   ├── 開発ガイド/                 # 進め方（ハーネス/TDD/計画/検証）
│   └── templates/                 # Plan / Task テンプレ
├── packages/
│   ├── schema/  @rigel/schema     # Zod スキーマ（全層共有の背骨。src/index.ts が単一真実源）※実在(M1)
│   └── ui/      @rigel/ui         # 牌SVG・confidenceハイライト・修正UI（RN/Web共有）※土台のみ(M6)
└── apps/
    ├── api/     api               # Cloudflare Workers。Hono + Drizzle + D1。DDD レイヤード ※実在
    │   ├── src/domain/            #   エンティティ + ポート（User / GameLog / Analyzer）
    │   ├── src/application/       #   ユースケース（AnalyzeAndSaveKifu / Get / List）
    │   ├── src/infrastructure/    #   Drizzle スキーマ・リポジトリ / GeminiAnalyzer(M5スタブ)
    │   ├── src/interfaces/http/   #   Hono アプリ
    │   ├── drizzle.config.ts / migrations/  #   D1 マイグレーション
    │   └── 詳細: docs/開発ガイド/05_APIアーキテクチャ.md
    ├── web/     web               # Next.js (App Router)。背骨スキーマ・UIを共有 ※土台(画面はこれから)
    └── mobile/  mobile            # React Native (Expo)。背骨スキーマ・UIを共有 ※土台(画面はこれから)
```

> `web`/`mobile` は共有パッケージ（`@rigel/schema`/`@rigel/ui`）を使うデモ画面のみ。
> web は `next build` + Vitest(jsdom)、mobile は `tsc`+ESLint がゲート（Expo の実機/EAS ビルドは CI 外）。

---

## 5. 技術スタックと制約（設計ドキュメント 6章より・決定済み）

| 領域 | 決定 | 備考 |
|---|---|---|
| 共通言語 | **TypeScript** 一気通貫 | スキーマ(Zod)を全環境が共有 |
| モバイル | **React Native (Expo)** | — |
| ブラウザ | **Next.js** | 共有URLのSEO対応も可 |
| UI共有手段 | **[未確定]** | Tamagui / RN Web / 自前SVG。牌は SVG 描画想定 |
| バックエンド | **Cloudflare Workers (TS) + Hono** | HTTP は Hono。api は DDD レイヤード（[開発ガイド/05](docs/開発ガイド/05_APIアーキテクチャ.md)） |
| DB / ORM | **Cloudflare D1 (SQLite) + Drizzle** | 撮影画像は保存しない。`Kifu` JSON のみ。スキーマ=`apps/api/src/infrastructure/db/schema.ts` |
| 認証 | **Google認証のみ** | 実装は後回し（M8） |
| AI | **Gemini API + Cloudflare AI Gateway** | モデル名はハードコードしない。河=Gemini 3 Flash、手牌=Flash-Lite 系 |
| 画像保存 | **しない** | 解析後 JSON のみ |
| モノレポ | turborepo / pnpm workspace | `packages/schema`,`packages/ui`,`apps/{mobile,web,api}` |

`[未確定]` の主要項目（設計ドキュメント 9章 TODO一覧）：`toAbsoluteSeat` の回転方向 / Agentic Vision の要否 /
AI精度の実測 / UI共有手段 / カウンタ整合の原子化 / 認証実装 / 無料枠・価格。**勝手に確定しない。**
（ORM は Drizzle に確定済み。）

---

## 6. 開発環境メモ

- OS: Windows 11 / シェルは PowerShell（主）と Bash（POSIX）。パスは環境に合わせる。
- git 管理済み（`main` ブランチ）。M0（モノレポ土台）/ M1（`@rigel/schema`）構築済み。`api`/`ui` は土台のみ、`web`/`mobile` は未作成。
- ツールチェーン：Node.js >= 20 / **pnpm 10**（workspace）/ turborepo / Vitest / ESLint / Prettier。Workers は wrangler（M5/M7 で本格導入）、モバイルは Expo（M5+）。
- AI の鍵などの秘匿情報は `.env` / `.dev.vars`（読み取りは権限で deny 済み・コミットしない。雛形は `.env.example`）。AI 呼び出しは **AI Gateway 経由**。
- 検証コマンドは [docs/開発ガイド/04_検証とCIゲート.md](docs/開発ガイド/04_検証とCIゲート.md) に一元化。ルートで `pnpm typecheck / lint / format:check / test / build`。CI は `.github/workflows/ci.yml`。

---

## 7. このファイルの保守

- 新しい決定・規約・ディレクトリが生まれたら**ここを更新してから**実装する。
- `[未確定]` を実機検証で確定したら、**設計ドキュメントの当該箇所を `[決定]` に更新**してから先へ進む。
- 「構想（why）」は設計ドキュメント、「進め方（how）」は開発ガイド、「エージェントの起点（what to do now）」はこの CLAUDE.md、と役割を分ける。
