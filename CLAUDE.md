# CLAUDE.md — rigel 開発エージェント向けハーネス文脈

> このファイルは Claude Code が毎セッションの起点として読む永続アーティファクトです。
> Codex の起点は [AGENTS.md](AGENTS.md)。共通ルールを変更するときは両方の整合を確認してください。
> 人間向けの読み物ではなく「エージェントが正しく動くための足場（harness）」として書かれています。
> 迷ったらここに戻り、ここに無い前提は勝手に作らず確認してください。

---

## 0. このプロジェクトは何か（30秒版）

**rigel** = 実物の麻雀卓を撮った写真から、**牌譜（盤面）のドラフトを自動生成**し、
ユーザーが確信度の低い箇所を修正・保存・共有できるサービス。
（rigel はリポジトリ/コードネーム。ユーザー向けブランドは **RAISHA**・本番ドメインは
**raisha.jp** / api.raisha.jp（[決定] 2026-07-30）。表示名の RAISHA 化は反映済み。
旧名 "RIGEL Next" が残るのは RevenueCat の採取済み Webhook ペイロード（テスト fixture）
のみで、現行の Entitlement 識別子は `next` / `pro`。）

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
4. **AI に推測させない。** 読めない・迷う牌は推測で埋めず `tile: null` でスロットを残す（枚数・`order` 連番を壊さない）。**数値 confidence は廃止（[決定] 2026-07-24。モデルの自己申告数値は較正が保証できない）**。AI 出力は常に**目検必須のドラフト**として扱い、null 牌は必ず人が埋める。精度の最重要指標は「null で白旗を揚げずに誤読した率（misreadRate）」。
5. **`[決定]` と `[未確定]` を取り違えない。** 設計ドキュメントの `[未確定]`（例: `toAbsoluteSeat` の回転方向、Agentic Vision の要否）を勝手に確定して実装を進めない。要実機検証は検証してから本実装し、結論を設計ドキュメントに反映する。
6. **課金は成功時のみ。** 枠は **Gemini 呼び出し回数**で数え、解析が**成功したときだけ実呼び出し数ぶん加算**（`recordGeminiCalls`）。失敗時は消費させない。プラン別枠（free0/next100/pro320）と保存上限（**半荘単位**: 非公開 free5・下書き free5・有料無制限、1半荘30局まで）を壊さない。
7. **画像を保存しない。** 撮影画像は永続化しない（保存するのは解析後の `Kifu` JSON のみ）。プライバシー・ストレージ両面の前提。**公開範囲（public/private・既定 private）・ルール・選手情報（players）は半荘単位**（局ごとに持たず、変更は配下の全局へ一括反映・新局は引き継ぎ・局単位の PUT では書き換え不可）。private は所有者のみ閲覧可。
7-2. **個人情報は外に出さない。** 初回登録のプロフィール（handle/表示名）は **Google 情報を使わずランダム生成**。email は緊急・不正調査の運用のためだけに DB 保存し、**API レスポンスには絶対に含めない**。プロフィールの非公開機能は無い（常に公開）。
7-3. **「誰が」は返さない。** 何切るの回答（`problem_answers`）とお気に入り（`favorites`）は、API が外に出すのを
   **集計値と「自分の状態」だけ**に限る（回答=choiceKey ごとの件数／★=`favoriteCount` と `viewerFaved`）。
   誰が何と答えたか・誰が★を付けたかを返す口を増やさない。**ポリモーフィックな参照（`favorites.target_*`）は
   外部キーを張れない**ので、対象削除・退会での掃除は各ユースケースの責務（消し漏らすと退会が FK 違反で落ちる）。
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
8. 記録      : 学び／決定を設計ドキュメントとエージェント起点に反映（[未確定]→[決定] 更新）
```

詳細は [docs/開発ガイド/03_タスク分解とPlan運用.md](docs/開発ガイド/03_タスク分解とPlan運用.md) と
[docs/開発ガイド/04_検証とCIゲート.md](docs/開発ガイド/04_検証とCIゲート.md)。

このループは Claude Code のコマンド／エージェントで実行できる（詳細 [.claude/README.md](.claude/README.md)）:
- `/plan <機能>` → 計画して合意 ／ `/tdd <振る舞い>` → Red→Green→Refactor ／ `/gate` → 検証ゲート ／ `/trust-check` → 信頼ゲート監査
- サブエージェント: `tdd-implementer`（実装委譲）・`trust-auditor`（信頼ゲート監査）・`harness-reviewer`（設計レビュー）

---

## 4. リポジトリ構成

> 中核ループ（撮影→解析→半荘に保存→閲覧→修正→保存）まで実装済み。残るは外部依存
> （Gemini鍵/AI Gateway・Photon WASM ランタイム・ラベル画像・デプロイ・OAuth設定・
> 課金鍵の本番設定とストア商品登録＝Stripe/RevenueCat/App Store/Play）。
> ディレクトリを新設するときはこの構成に沿わせる。逸脱するなら先に本ファイルを更新して合意する。

```
rigel/
├── AGENTS.md                      # Codex の起点（ツール非依存の規約・検証）
├── CLAUDE.md                      # ← このファイル（エージェントの起点）
├── package.json …                 # モノレポ土台（pnpm/turbo/tsconfig。pnpm.overrides で @types/react を19に固定）
├── .github/workflows/ci.yml       # CI ゲート（typecheck/lint/format/test/build）
├── docs/
│   ├── mahjong-kifu-app-design.md # 構想・スコープの単一真実源（why/what / [決定][未確定]）
│   ├── river_reader_prompt.md     # 河読み取りプロンプト（単方向版は api 内に実装）
│   ├── 開発ガイド/                 # 進め方（01ハーネス〜05APIアーキ / 06牌デザイン）
│   └── templates/                 # Plan / Task テンプレ
├── packages/
│   ├── schema/  @rigel/schema     # Zod スキーマ（全層共有の背骨。Kifu/Ai*Response/toAbsoluteSeat）
│   ├── ui/      @rigel/ui         # 表示・修正ロジック（tileFace/tileAssetName/collectReviewItems/applyTileEdit）
│   └── client/  @rigel/client     # api クライアント + DTO（createApiClient(baseUrl)。web/mobile 共有）
└── apps/
    ├── api/     api               # Cloudflare Workers。Hono + Drizzle + D1。DDD レイヤード
    │   ├── src/domain/            #   user / game / kifu(GameLog,Analyzer) / auth / analysis(原子化ポート) / favorite
    │   ├── src/application/       #   Analyze/Update/Get/List Kifu, Games, Authenticate…
    │   ├── src/infrastructure/    #   drizzle 各repo / gemini パイプライン / auth(jose) / analysis(D1 batch)
    │   ├── src/interfaces/http/   #   Hono アプリ（app.ts=横断MW、routes/=account/games/kifu/problems/quiz/favorites/billing）
    │   ├── src/eval/              #   AI精度の指標（accuracy.ts）
    │   └── drizzle.config.ts / migrations/  #   D1 マイグレーション
    ├── web/     web               # Next.js (App Router)。/kifu(公開牌譜一覧) /problems(公開何切る一覧) /mypage(マイページ=牌譜/何切る/お気に入り/特訓タブ) /kifu/[gameId]/[logId](盤面エディタ) /k/[gameId](公開ビューア・動的OGP=lib/og-meta+opengraph-image) /p/[id](何切る回答) /problems/new・/problems/[id]/edit(何切る編集) /settings /u/[handle] /login
    └── mobile/  mobile            # Expo + react-navigation。タブ=牌譜/何切る/マイページ(牌譜・何切る)/設定 + Capture/GameDetail/Board/ProblemAnswer/ProblemEdit/Login
```

> 検証ゲート: web は `next build` + Vitest(jsdom)、mobile は `tsc`+ESLint+Jest(jest-expo/RNTL)（Expo 実機/EAS は CI 外）、
> api/packages は `tsc`+Vitest+ESLint。Gemini 解析・Photon・実認証は鍵/ランタイム設定後に疎通。

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
| 認証 | **Google + Sign in with Apple** | App Store 審査要件 4.8 で Apple 併設必須（2026-07-17 決定・実装済み）。Android の Apple ログインは web フロー（api の `/auth/apple/callback` が form_post をアプリ scheme へ中継。2026-07-28 決定・実装済み）。退会時は Apple トークンを revoke |
| 課金 | **Web=Stripe / アプリ=IAP（RevenueCat SDK）** | **真実源=RevenueCat**（Webhook だけが plan を書く）。`users.plan` は D1 射影。設計7章・[docs/plans/billing-revenuecat.md](docs/plans/billing-revenuecat.md) |
| AI | **Gemini API + Cloudflare AI Gateway** | モデル名はハードコードしない。河・手牌とも Flash 系（手牌の Lite は eval 実測で力不足 → Flash に変更・2026-07-24） |
| 計測 | **GA4 に統一**（web=gtag 実装済み / アプリ=Firebase Analytics はビルド検証後） | 1プロパティ3ストリーム。イベント名は @rigel/ui の ANALYTICS_EVENTS が真実源。**PII は送らない・広告用途に使わない**。[docs/plans/analytics.md](docs/plans/analytics.md) |
| 画像保存 | **しない** | 解析後 JSON のみ |
| モノレポ | turborepo / pnpm workspace | `packages/schema`,`packages/ui`,`apps/{mobile,web,api}` |

`[未確定]` の主要項目（設計ドキュメント 9章 TODO一覧）：`toAbsoluteSeat` の回転方向 / Agentic Vision の要否 /
実写でのAI精度再計測 / UI共有手段 / 購入経路の実機疎通。**勝手に確定しない。**
（カウンタ整合の原子化は 2026-07-12 に [決定]: 差分の原子適用＋有界オーバーシュートの許容。）
（ORM は Drizzle に確定済み。）

---

## 6. 開発環境メモ

- OS: Windows 11 / シェルは PowerShell（主）と Bash（POSIX）。パスは環境に合わせる。
- **罠**: web の `cf:build`（OpenNext）は next/og 使用時、pnpm の symlink 越しに実体
  `node_modules/.../next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf` を `.ttf.bin` に
  リネームし、以後 `next dev` の OG 画像が ENOENT で落ちる。`.ttf.bin` を `.ttf` に**コピー**して復旧
  （`.bin` は残す）。ローカル `cf:preview`/`wrangler dev` は Windows 非対応で全ルート500（本番は CI/Linux ビルドで問題なし）。
- git 管理済み（`main` ブランチ）。`api` / `web` / `mobile` と共有3パッケージを実装済み。外部鍵・実機・本番ストア／デプロイに依存する検証は別途行う。
- ツールチェーン：Node.js >= 22.13（実運用は 24。CI/deploy/Codemagic も 24）/ **pnpm 10**（workspace）/ turborepo / Vitest / **Jest(mobile=jest-expo + React Native Testing Library)** / Playwright / ESLint / Prettier。Workers は wrangler、モバイルは **Expo SDK 57**（React 19 / RN 0.86。移行 2026-07-27）。
- AI の鍵などの秘匿情報は `.env` / `.dev.vars`（読み取りは権限で deny 済み・コミットしない。雛形は `.env.example`）。AI 呼び出しは **AI Gateway 経由**。
- 検証コマンドは [docs/開発ガイド/04_検証とCIゲート.md](docs/開発ガイド/04_検証とCIゲート.md) に一元化。ルートで `pnpm typecheck / lint / format:check / test / build`。CI は `.github/workflows/ci.yml`。
- **依存のバージョン固定（override・ペア制約）には全て理由がある。** 依存を上げる前・依存起因で壊れた時は
  [docs/開発ガイド/07_依存固定台帳.md](docs/開発ガイド/07_依存固定台帳.md) を必ず読む。固定を増減したら台帳も同じコミットで更新する。

---

## 7. このファイルの保守

- 新しい決定・規約・ディレクトリが生まれたら**ここを更新してから**実装する。
- `[未確定]` を実機検証で確定したら、**設計ドキュメントの当該箇所を `[決定]` に更新**してから先へ進む。
- 「構想（why）」は設計ドキュメント、「進め方（how）」は開発ガイド、「エージェントの起点（what to do now）」は
  Codex が `AGENTS.md`、Claude Code がこの `CLAUDE.md`、と役割を分ける。
