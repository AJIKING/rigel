# 05. API アーキテクチャ（DDD レイヤード / Cloudflare Workers）

`apps/api`（Cloudflare Workers）の実装設計。**DDD のレイヤード構成**で、HTTP は **Hono**、
DB は **Drizzle + D1**。中心の牌譜スキーマ（`@rigel/schema`）を共有カーネルとして全層が参照する。

> 関連: [01 ハーネスエンジニアリング](01_ハーネスエンジニアリング.md) / [04 検証とCIゲート](04_検証とCIゲート.md) / 設計ドキュメント 5章

---

## レイヤーと依存方向

依存は**内向き**だけ。外側（HTTP/DB/AI）が内側（ドメイン）に依存し、内側は外側を知らない。

```
interfaces (HTTP/Hono) ─┐
                        ├─▶ application (ユースケース) ─▶ domain (エンティティ + ポート)
infrastructure (Drizzle/Gemini) ─┘            ▲                         ▲
        └───────────── implements ポート ──────┘                         │
                         @rigel/schema（共有カーネル: Kifu 型）───────────┘
```

| 層 | 役割 | 依存してよい先 | 例 |
|---|---|---|---|
| **domain** | エンティティ・不変条件・ポート（IF） | `@rigel/schema` のみ | `User`, `GameLog`, `*.repository`, `Analyzer` |
| **application** | ユースケース（手順の調整） | domain, `@rigel/ui`（純 TS 部のみ。[決定] 2026-08-04: 特訓のシードリプレイ再採点・ランキング整列で共有ロジックを参照。React 依存は無いパッケージだが、domain へは持ち込まない） | `AnalyzeAndSaveKifu`, `GetKifu`, `FinishQuizSession` |
| **infrastructure** | ポートの実体（DB/AI/外部） | domain, 外部ライブラリ | `Drizzle*Repository`, `GeminiAnalyzer`, `db/schema` |
| **interfaces** | 入口（HTTP ルーティング＋キュー consumer） | application（コンテナ経由） | `http/app.ts`(Hono), `queue/analysis-consumer.ts` |
| **composition-root** | DI の組み立て（唯一「具体」を知る） | 全層 | `buildContainer(env)` |

> **鉄則**: domain / application は Drizzle・Hono・Gemini を import しない。差し替え可能にし、AI(非決定的)や DB を**境界でモック**してテストできるようにするため（ハーネス: 検証ループ）。

---

## フォルダ構成

```
apps/api/
├── drizzle.config.ts            # Drizzle Kit（D1=SQLite方言）
├── wrangler.toml                # Workers / D1 バインディング / migrations_dir
├── migrations/                  # drizzle-kit generate の出力（生成物）
└── src/
    ├── index.ts                 # Worker エントリ（fetch=Hono と queue=解析 consumer の2つを公開）
    ├── env.ts                   # Env（DB / Gemini / AI Gateway / R2 / Queues バインディング）
    ├── composition-root.ts      # buildContainer(env): DI 窓口
    ├── domain/
    │   ├── user/                # User 集約 + UserRepository(ポート)
    │   ├── kifu/                # GameLog + GameLogRepository + Analyzer(ポート)
    │   └── analysis/            # 原子化(AnalysisStore) / ジョブ(AnalysisJob*) / 搬送(ImageStore・Queue)の各ポート
    ├── application/             # AnalyzeAndSaveKifu / StartAnalysisJob / RunAnalysisJob / GetKifu / ListKifu…
    ├── infrastructure/
    │   ├── db/                  # schema.ts(Drizzle) / client.ts(drizzle(d1))
    │   ├── user/               # DrizzleUserRepository
    │   ├── kifu/               # DrizzleGameLogRepository
    │   ├── analysis/           # D1 batch(原子化) / DrizzleAnalysisJobRepository / R2AnalysisImageStore
    │   └── gemini/             # Gemini 連携（client / extract-json / read-river / assemble / analyzer）
    └── interfaces/
        ├── http/                # app.ts(Hono) / validate.ts / routes/
        └── queue/               # analysis-consumer.ts（解析ジョブの dispatch）
```

---

## リクエストの流れ（例: 解析→保存）

```
POST /analyze（要認証 / multipart: river, cameraBottomSeat, hand_*?, gameId?, handFromRiver?）
  → 認証ミドルウェアで userId、無ければ 401
  → Hono(app.ts) が File→ImageRef 変換して container.startAnalysisJob.start を呼ぶ
  → StartAnalysisJob.start（同期部分。ここまでで応答を返す）:
      1. AnalyzeAndSaveKifu.preflight（枠・半荘の所有/上限。NG は 402/404/409）
      2. analysis_jobs に processing のジョブ行 → 半荘行を作成（行が先＝孤児画像を作らない）
      3. 画像を R2 へ恒久保存（games/{gameId}/{jobId}/…。[決定] 2026-08-03 ルール7転換）
      4. Queues へ {jobId, 画像キー…} を送信
  → 202 { jobId }（クライアントは GET /analyze/jobs/:id をポーリング）

queue consumer（interfaces/queue → RunAnalysisJob。実写真の Gemini は 10〜150秒/回のため非同期）:
      1. ジョブが processing でなければ何もしない（再送との競合で二重実行しない）
      2. R2 から画像を取得（無ければ failed: images_missing）
      3. AnalyzeAndSaveKifu.execute（Zod 検証・原子的保存・成功時のみ課金は従来どおり）
      4. done/failed をジョブへ書く。写真は消さない（元写真として半荘に残る。
          掃除は半荘削除・退会時のみ。終端書き込みの失敗は再送に乗せない＝二重課金防止。
          processing のまま残りクライアントはタイムアウト表示）
```

---

## Gemini 連携（解析パイプライン）

`infrastructure/gemini/` に、河・手牌の読み取りを部品化して実装する。

```
GeminiAnalyzer.analyze(input):
  1. preprocessor.split(riverImage)      河1枚 → bottom/right/top/left の正立画像
                                          (river-layout で切り出し/回転を決め、ImageProcessor=Photon が適用)
  2. readRiverDirection × 4 (並列)        各方向: client.generateText → extractJson → AiRiverResponseSchema.parse
  3. readHand × (提供された方向)          手牌(正立済み)を読む → AiHandResponseSchema.parse
  4. assembleKifu                         toAbsoluteSeat で相対→絶対、KifuSchema.parse で最終検証
```

| 部品 | 役割 | テスト |
|---|---|---|
| `gemini-client` | Gemini generateContent を AI Gateway 経由で叩く。**応答パーツを種類で仕分け、テキストのみ連結**（混在パーツ対策）。fetch 注入可 | fake fetch |
| `extract-json` | テキストから JSON 抽出（フェンス/前置き/釣り合い括弧に頑健） | 純粋 |
| `read-river` / `read-hand` | 1方向/1人: Gemini → JSON抽出 → `Ai*ResponseSchema.parse` | fake client |
| `river-prompt` / `hand-prompt` | 単方向の河 / 1人分の手牌プロンプト | — |
| `river-layout` | **4分割の切り出し矩形＋正立回転（割合・純粋）**。bottom=0/top=180 確定、left/right の角と切り出し精度は要実機検証 | 純粋 |
| `image-processor` + `image-river-preprocessor` | ポート（cropRotate）＋それを使う前処理。レイアウトを画像に適用 | fake ImageProcessor |
| `photon-image-processor` | `ImageProcessor` の実体（`@cf-wasm/photon`/WASM、遅延import、メモリ解放） | 実機検証 |
| `assemble` | 相対→絶対変換（鳴き元も）+ `KifuSchema.parse` | 純粋 |

> **モデル名はハードコードしない**。`env.GEMINI_RIVER_MODEL` / `GEMINI_HAND_MODEL`（未指定なら既定値）で渡す。
> 設計4章 `[未確定]`「JSON強制とtool併用の挙動」は **client の種類別仕分け + extract-json で解決済み**。
> 残り `[要実機検証]`: 4分割の切り出し精度・left/right の回転角（`river-layout`）、Photon の回転方向、AI読み取り精度（eval）、Agentic Vision の要否（A/B）。
> `/analyze` の通し配線（multipart・認証・半荘への局保存・**保存＋カウントの原子化**）は **実装済み**。残りは実行時ランタイム（鍵/WASM）。

---

## 信頼ゲートの所在（[04](04_検証とCIゲート.md) と対応）

| 信頼ゲート | どの層で守るか |
|---|---|
| AI出力を使う前に Zod 検証 | `read-river` が `AiRiverResponseSchema.parse`、`assemble` が `KifuSchema.parse` / `interfaces/http/validate.ts` |
| 推測で埋めない（null 白旗） | `@rigel/schema`（`ReadTile`/`Discard`）+ 河プロンプトの指示 |
| 課金は成功時のみ加算 | `domain/user`（`recordSuccessfulAnalysis`）+ `AnalyzeAndSaveKifu` の手順 |
| 画像は恒久保存・所有者のみ・データ削除で掃除 | [決定] 2026-08-03（photo-retention.md）。D1 に画像列は持たず R2（バケット rigel）へ。配信は所有者ガード必須（`ListGamePhotos`/`ProblemPhotos`）。削除連鎖は `DeleteGame`/`DeleteProblem`/`DeleteProblemDraft`/`DeleteAccount` が R2 を D1 より先に掃除 |

---

## Drizzle + D1

- スキーマ: `src/infrastructure/db/schema.ts`（`users` / `game_logs`）。牌譜は `text({mode:"json"}).$type<Kifu>()` で JSON 保持。
- クライアント: `createDb(env.DB)` = `drizzle(d1, { schema })`。
- マイグレーション:
  1. `pnpm --filter api db:generate` … drizzle-kit が `migrations/` に SQL を生成。
  2. `pnpm --filter api db:migrate:local` … wrangler がローカル D1 に適用。
  3. `pnpm --filter api db:migrate` … 本番 D1 に適用（`wrangler d1 create rigel` で発行した `database_id` を `wrangler.toml` に設定後）。

> **カウンタ整合（実装済み）**: 半荘・局・カウント加算は `AnalysisStore` ポート（実体=
> `DrizzleAnalysisStore` の **D1 batch**）で**1トランザクション**にまとめて原子化。
> ユースケースは domain の手順（読み取り→解析→カウント加算）だけ持ち、永続化の原子性は store に委譲する。

---

## 各層のテスト戦略

| 層 | テスト方法 |
|---|---|
| domain | 純粋ロジックを Vitest で直接（`User` の無料枠・月リセット・成功時のみ加算） |
| application | **In-memory フェイク**でポートを差し、手順を検証（成功で+1 / 枠超過で解析せず / 失敗で加算せず） |
| interfaces | `app.request()`（Hono）で HTTP を直接叩く（DBを使わない経路は fake env で十分） |
| infrastructure(Drizzle) | Miniflare/ローカル D1 を使った結合テスト（**今後**。M5/M7 で追加） |

> AI 精度（非決定的）は合否ゲートに載せない。`Analyzer` を境界に置くことで、ユースケースは決定的にテストできる。

---

起点に戻るなら [../../CLAUDE.md](../../CLAUDE.md)、ゲートは [04_検証とCIゲート.md](04_検証とCIゲート.md)。
