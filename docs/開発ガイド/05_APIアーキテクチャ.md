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
| **application** | ユースケース（手順の調整） | domain | `AnalyzeAndSaveKifu`, `GetKifu`, `ListKifu` |
| **infrastructure** | ポートの実体（DB/AI/外部） | domain, 外部ライブラリ | `Drizzle*Repository`, `GeminiAnalyzer`, `db/schema` |
| **interfaces** | 入口（HTTP ルーティング） | application（コンテナ経由） | `http/app.ts`(Hono), `http/validate.ts` |
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
    ├── index.ts                 # Worker エントリ（Hono アプリを公開するだけ）
    ├── env.ts                   # Env（DB / Gemini / AI Gateway バインディング）
    ├── composition-root.ts      # buildContainer(env): DI 窓口
    ├── domain/
    │   ├── user/                # User 集約 + UserRepository(ポート)
    │   └── kifu/                # GameLog + GameLogRepository + Analyzer(ポート)
    ├── application/             # AnalyzeAndSaveKifu / GetKifu / ListKifu
    ├── infrastructure/
    │   ├── db/                  # schema.ts(Drizzle) / client.ts(drizzle(d1))
    │   ├── user/               # DrizzleUserRepository
    │   ├── kifu/               # DrizzleGameLogRepository
    │   └── gemini/             # GeminiAnalyzer（M5 で実装）
    └── interfaces/http/         # app.ts(Hono) / validate.ts
```

---

## リクエストの流れ（例: 解析→保存）

```
POST /analyze
  → Hono(app.ts) が container.analyzeAndSaveKifu を呼ぶ
  → AnalyzeAndSaveKifu.execute:
      1. users.findById           （ポート / 実体=DrizzleUserRepository）
      2. user.canAnalyze(now)      （ドメイン: 無料枠の判定）
      3. analyzer.analyze(input)   （ポート / 実体=GeminiAnalyzer。Zod検証済みKifuを返す契約）
      4. gameLogs.save(log)        （保存が成功してから…）
      5. user.recordSuccessfulAnalysis / users.save  （…カウント+1。成功時のみ）
```

> `/analyze` は **M5（解析パイプライン）まで 501**。`GeminiAnalyzer` は未実装スタブ。
> ポート（`Analyzer`）は確定しているので、M5 は infrastructure 側を埋めるだけで済む。

---

## 信頼ゲートの所在（[04](04_検証とCIゲート.md) と対応）

| 信頼ゲート | どの層で守るか |
|---|---|
| AI出力を使う前に Zod 検証 | `Analyzer` の**契約**（返す Kifu は `KifuSchema` 検証済み）/ `interfaces/http/validate.ts` |
| 推測で埋めない（null+confidence） | `@rigel/schema`（`ReadTile`/`Discard`）+ Analyzer 実装（M5） |
| 課金は成功時のみ加算 | `domain/user`（`recordSuccessfulAnalysis`）+ `AnalyzeAndSaveKifu` の手順 |
| 画像を保存しない | `GameLog`/`game_logs` に画像列を持たない（`kifu` JSON のみ） |

---

## Drizzle + D1

- スキーマ: `src/infrastructure/db/schema.ts`（`users` / `game_logs`）。牌譜は `text({mode:"json"}).$type<Kifu>()` で JSON 保持。
- クライアント: `createDb(env.DB)` = `drizzle(d1, { schema })`。
- マイグレーション:
  1. `pnpm --filter api db:generate` … drizzle-kit が `migrations/` に SQL を生成。
  2. `pnpm --filter api db:migrate:local` … wrangler がローカル D1 に適用。
  3. `pnpm --filter api db:migrate` … 本番 D1 に適用（`wrangler d1 create rigel` で発行した `database_id` を `wrangler.toml` に設定後）。

> **⚠️【未確定/要設計】カウンタ整合**: 「保存→カウント加算」は競合で二重加算・取りこぼしが起きうる。
> infrastructure 層で **D1 の batch/トランザクション**にまとめて原子化する（設計ドキュメント 5章・9章 #6）。
> 現状のユースケースは順序を守るのみ。アプリケーションのロジックは変えずに、保存とカウントを束ねる
> `TransactionalAnalyzeStore` 的なアダプタを infrastructure に足すのが素直。

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
