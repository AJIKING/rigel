# 麻雀 牌譜サイト — 設計ドキュメント（v0.1 / draft）

> このドキュメントは開発ハーネスのコンテキストとして使う前提で書かれている。
> **[決定]** は確定済み、**[未確定]** はまだ決めていない／実機検証が必要な項目。
> 両者を取り違えないこと。`[未確定]` を勝手に確定させて実装を進めないこと。

---

## 1. プロダクト概要

実物の麻雀卓を撮った写真から、**牌譜（盤面）のドラフトを自動生成**し、ユーザーが修正・保存・共有できるサービス。

**コアバリュー**: 卓全体を撮るだけで盤面が牌譜データになる。手入力の手間をなくす。

**[決定] 既存ツールとの差別化**: 実物写真の麻雀アプリは「和了手牌を撮って点数計算する」ものばかりで、**河を含む卓全体を撮って盤面を再現・記録するツールは存在しない**（調査済み）。ここがニッチの空き。点数計算アプリですら実物写真では精度が甘いという評価がある。

---

## 2. スコープ

### [決定] やること
- 実物卓を上から撮った画像から、**最終盤面の再現**（各家の手牌・鳴き・河）
- 河の**打牌順**の再現（河の並び順 = 時系列）
- リーチ宣言牌の検出（横向き牌）
- 鳴き（ポン/チー/カン）と**鳴き元（誰から鳴いたか）**の記録
- AIによるドラフト生成 → 人が確信度の低い箇所を修正 → 保存
- 牌譜のユーザーごとの保存・閲覧・共有

### [決定] やらないこと（明示的な非スコープ）
- **点数計算をしない**（ドラ表示牌・場風・親など写真に写らない情報に依存するため）。
  ただし**記録はする**：本場・供託・ドラ表示牌・最終巡目・親・場風は `Kifu.meta` に手入力で保存できる
  （写真に写らない情報なので AI では埋めない。点数計算には使わず、表示・記録のみ）。
- **手出し / 自摸切りを AI では判定しない**（河に痕跡が残らず写真から復元不可能）。ただし**人が編集画面で手入力**でき、`Discard.tsumogiri` に保存する（自摸切りは盤面で少しグレー表示）。
- **局の完全な進行再現（全ツモ・全打のターン単位）をしない**（1枚はスナップショット）
- **撮影画像を保存しない**（解析後のJSONのみ保存。プライバシー・ストレージ両面で有利）
- ゲーム画面（雀魂・天鳳など）のスクショは対象外。**実物卓のみ**

---

## 3. 入力仕様

### [決定] 撮影枚数
- ユーザーが撮るのは **5枚**:
  - 河 **1枚**（卓を上から撮影。**和了 または 流局の瞬間**に撮る）
  - 各プレイヤーの手牌 **4枚**（各自が自分の正面から1枚ずつ）
- 鳴いた晒し牌は **手牌側に寄せて撮る**（横向き等で区別できる状態で手牌写真のフレームに入れる）

### [決定] 撮影の規格化（重要）
- 河の写真は**撮影ガイドで規格化する**。カメラ画面に枠／十字ガイドを表示し、「卓の中心を中央に、4辺を枠に合わせて」撮らせる。
- 規格化により、後段のシステム4分割が成立する。
- 手牌は各自が正面から撮るので**元から正立**。分割も回転も不要。

### [決定] 撮影後の確認フロー
- 河の自動4分割の結果をユーザーに見せ、分割が正しいか**確認させるフロー**を入れる。

---

## 4. AI解析パイプライン

### [決定] 全体の流れ
```
河1枚 ──[システムで4分割＋正立化]──> 河4枚（bottom/right/top/left）
手牌4枚 ────────────────────────────> 手牌4枚（撮影時点で正立）
                                         ↓
            計8枚を Gemini に投げる（手牌は1人=1枚、河は1方向=1枚）
                                         ↓
        各レスポンスを Zod で検証（AiRiverResponse / AiHandResponse）
                                         ↓
     カメラ相対(bottom/right/top/left) → 絶対位置(東南西北) へ変換
                                         ↓
              1つの Kifu オブジェクトに組み立て → KifuSchema で最終検証
                                         ↓
                   ドラフトとしてUIへ（confidence低=要確認ハイライト）
```

### [決定] 河の4分割
- 入力は**全体1枚で固定**（この方針は変えない）。ユーザーは1枚撮るだけ。
- **サーバ側で受け取った1枚を内部で4分割し、各方向を正立するまで回転**してからAIに渡す。
- 背景: 実画像テストで bottom（正立・手前・大）は高精度だが、top（180°）/left(+90°)/right(−90°) は回転・遠近・密集で精度が低い。分割＋正立で全方向を bottom と同条件に揃える。
- 実装: 切り出し/回転の決定は `apps/api/src/infrastructure/gemini/river-layout.ts`（純粋・テスト済み）、ピクセル操作は `@cf-wasm/photon`（WASM）。**[要実機検証]** 切り出し精度と left/right の回転角は実画像で調整（[開発ガイド/05](開発ガイド/05_APIアーキテクチャ.md)）。

### [決定] モデル選定
- **手牌**: 素直なタスク（正立・横一列）。`Gemini Flash-Lite` 系で十分（入力 約$0.25 / 出力 約$1.50 per 1M tokens）。
- **河**: 難所。`Gemini 3 Flash`。必要に応じて **Agentic Vision（Code Execution）** を併用（入力 約$0.50 / 出力 約$3.00 per 1M tokens）。
- **[未確定] Agentic Vision の要否**: 河を4分割＋正立した後なら、素のFlashで読める可能性が高い（コスト削減）。**同じ画像で「素のFlash」と「Code Execution有り」をA/B比較して決める**。分割で条件が良くなったぶん、Agentic Vision無しで足りるかもしれない。
- モデル名は AI Studio で**現行の対応モデルを確認**して使う（ハードコードしない）。

### [決定] 牌の記法
- 天鳳式: `1m–9m`(萬) / `1p–9p`(筒) / `1s–9s`(索) / 字牌 `1z`=東 `2z`=南 `3z`=西 `4z`=北 `5z`=白 `6z`=發 `7z`=中 / 赤ドラ `0m 0p 0s`。
- AIに席名（東南西北）を推測させない。**カメラ相対(bottom/right/top/left)で出させ、アプリ側で絶対位置へ変換**する。

### [決定] プロンプト方針
- 河は**1方向ごとの単方向プロンプト**。実装は `apps/api/src/infrastructure/gemini/river-prompt.ts`（`river_reader_prompt.md` の1方向版）。出力は `AiRiverResponse` 形式。
- 全牌に **confidence(0.0–1.0)** を出させる。読めない牌は `tile: null`＋スロット保持（枚数・順序を壊さない）。推測で埋めさせない。
- 萬子は「まず萬子と判定 → 数字を別途読む」と手順を分けさせる（誤読の定番対策）。
- **[決定] JSON強制とtool併用の挙動**: 応答の混在パーツ（テキスト＋生成コード＋実行結果）は **gemini-client が種類で仕分けてテキストのみ連結**し、**extract-json** でフェンス/前置きに頑健に JSON を抽出する（実装・テスト済み）。

### [決定/レビュー観点] 精度の測り方
確実な精度数値は未知（先行事例ゼロ）。**自前で正解ラベル付きテスト画像20–30枚**を作り、以下を測る:
1. 牌単位の正解率
2. **「confidence高いのに誤読」率**（最重要。自信満々の誤りは人が見逃す）
3. 順序・リーチ牌の正解率

---

## 5. データモデル

### [決定] 牌譜スキーマ（背骨）
- **Zod** で1つ定義し、RN / Next.js / Workers / AI出力検証 すべてが共有する。
- 実装ファイル: `packages/schema/src/index.ts`（背骨の単一真実源。全層がここを import）。
- 主要型: `Kifu`（保存単位＝課金単位＝共有URL単位）、`SeatBoard`、`Meld`、`Discard`、`ReadTile`（牌＋confidence）。
- AI出力検証用: `AiRiverResponse` / `AiHandResponse`（カメラ相対）。
- 変換関数: `toAbsoluteSeat(camera, bottomSeat)`。
- **[未確定／要実機検証] 相対→絶対の回転方向**: `toAbsoluteSeat` の `CAMERA_ORDER` は撮影の向きに依存。東家を手前に置いた写真を1枚撮り、right/top/left が南/西/北で合うか目視確認。合わなければ反転。**ここを誤ると全席が90°ズレる。**

### [決定] D1 テーブル（概要）
- `users`: `id`, `google_sub`(Google認証のsub), `plan`(free/paid), `analysis_count_this_month`, `count_reset_at`, ...
- `game_logs`: `id`, `user_id`, `kifu`(Kifu の JSON を丸ごと), `created_at`, ...
- 撮影画像は保存しない。`game_logs` に入るのは解析後の `Kifu` JSON のみ。
- **[決定] ORM = Drizzle**（軽量・D1相性良・型連動）。スキーマ実体は `apps/api/src/infrastructure/db/schema.ts`、マイグレーションは drizzle-kit + `wrangler d1`。詳細は [開発ガイド/05_APIアーキテクチャ.md](開発ガイド/05_APIアーキテクチャ.md)。
- **[決定] カウンタの整合性**: 半荘・局・カウント加算を `AnalysisStore`（実体=D1 batch）で**1トランザクションに原子化**（`apps/api/src/infrastructure/analysis/drizzle-analysis-store.ts`）。途中失敗・競合での不整合を防ぐ。手順は「保存成功時のみ加算」。

---

## 6. 技術スタック

| 層 | 技術 | 状態 |
|---|---|---|
| モバイル | React Native (Expo) | [決定] |
| ブラウザ | Next.js | [決定] |
| 共有 | 型・ロジックは**完全共有**、UIコンポーネントも共有志向 | [決定] |
| UIコンポーネント共有手段 | Tamagui / React Native Web / 自前(react-native-svg) | **[未確定]**（一般UIは未決。牌は[決定]: SVG自前・面仕様を@rigel/uiで共有 → [開発ガイド/06](開発ガイド/06_牌のデザイン.md)） |
| バックエンド | Cloudflare Workers (TypeScript) + **Hono**（HTTP） | [決定] |
| API 構成 | **DDD レイヤード**（domain/application/infrastructure/interfaces）| [決定]（[開発ガイド/05](開発ガイド/05_APIアーキテクチャ.md)） |
| DB | Cloudflare D1 (SQLite) + **Drizzle ORM** | [決定] |
| 認証 | Google認証のみ | [決定]（実装は後回し） |
| AI | Gemini API + AI Gateway | [決定] |
| 画像保存 | しない | [決定] |

### [決定] 構成方針
- 全層 **TypeScript で一気通貫**。スキーマ(Zod)を全環境が共有。
- モノレポ想定（turborepo / pnpm workspace）。`packages/schema`, `packages/ui`, `apps/mobile`, `apps/web`, `apps/api`。
- 牌は **SVG 描画**（react-native-svg はRN/Web両対応。拡大に強くconfidenceハイライト等の動的装飾も柔軟）。
- AI呼び出しの手前に **Cloudflare AI Gateway** を噛ませる（キャッシュ・流量制御・コスト監視・レート制限対策）。

---

## 7. ビジネスモデル / 課金

### [決定]
- **Google認証必須**。ユーザーごとに牌譜を保存。
- **牌譜には公開範囲がある**: `public`（他ユーザーも閲覧可・共有URL）/ `private`（自分だけ）。**新規解析の既定は private**。
- **3プラン**（月額・Stripe サブスク）:
  | プラン | 月額 | 月の Gemini 呼び出し枠 | private 牌譜 |
  |---|---|---|---|
  | 無料 | ¥0 | 20回（≒2局） | 4件まで（public は無制限） |
  | RIGEL Next | ¥480 | 100回（≒10局） | 無制限 |
  | RIGEL Pro | ¥1,480 | 320回（≒32局） | 無制限 |
- **枠は「Gemini 呼び出し回数」で数える**（1局＝河4方向＋撮影した手牌の枚数ぶん呼ぶため、局数ではなく実呼び出し数）。これがレート制限とAIコスト爆発の防止を兼ねる。
- public 牌譜は全プランで保存無制限。

### [決定] 設計上の配慮
- カウントは**解析成功時のみ**、**実際の呼び出し回数ぶん**加算（失敗時は消費させない）。`User.recordGeminiCalls`。
- private の保存上限は**解析前にプリフライト判定**して、無料ユーザーの Gemini 枠を無駄にしない（`private_limit`）。
- **保存済み牌譜の閲覧**: public は誰でも、private は所有者のみ（`GET /kifu/:id` と一覧で制御）。新規解析だけ枠で制限する。

### 実装状況（2026-06 時点）
- **3プラン＋呼び出し課金を実装**: `User.plan`（free/next/pro）、`MONTHLY_CALL_QUOTA`（20/100/320）、`PRIVATE_KIFU_LIMIT`（free=4・有料=無制限）。`recordGeminiCalls` が成功時のみ実呼び出し数を加算、枠超過は `/analyze` が 402、private 上限超過は 403。
- **公開範囲**: `game_logs.visibility`（既定 private）。`PATCH /kifu/:id/visibility`（所有者のみ・`SetKifuVisibility`）。`GET /kifu/:id` と `/users/:id/kifu` は public のみ他者に見せる。
- **Stripe サブスク**: `POST /billing/checkout`（plan→price_id 選択・Checkout 作成）→ Webhook（`checkout.session.completed`→申込 tier /`customer.subscription.deleted`→free）で `User.changePlan`。tier は session.metadata、userId は client_reference_id / subscription.metadata に載せ、顧客ID保存は不要。
- web/mobile に Next/Pro のアップグレード導線（Stripe Checkout 遷移）と公開範囲トグル（web）。
- **鍵が未設定なら課金は無効**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_NEXT`/`STRIPE_PRICE_PRO` が揃わなければ `/billing/*` は 501。

### [未確定]（=運用・調整待ち）
- 無料/有料の機能差を呼び出し枠・public/private 上限以外にも設けるか。
- 呼び出し枠の数値（20/100/320）はコスト実測で再調整しうる。

---

## 8. コスト試算（[決定] 概算・実測で更新）

- 1局（盤面5枚撮影）の解析 ≒ **1〜3円**。
  - 手牌4枚（Flash-Lite, 素のVision）: 合計 約0.4円
  - 河（Gemini 3 Flash, Agentic Vision併用時）: 約2〜3円
  - **河を4分割＋正立 → Agentic Vision不要なら 1局1円前後まで下がる見込み**
- 最大コスト要因は**出力トークン**（Agentic Visionの思考プロセス分含む）。河の指示を欲張りすぎないこと。
- Cloudflare側（Workers/D1）は無料枠〜数ドル規模。
- コスト削減策: ①送信前に画像リサイズ（生写真をそのまま送らない／ただし河は読める解像度は確保）②河だけ高い武器、手牌は安いモデル ③出力を「指定JSONのみ」に縛る。

---

## 9. 未確定事項・要検証（TODO一覧）

| # | 項目 | 種別 | メモ |
|---|---|---|---|
| 1 | `toAbsoluteSeat` の回転方向 | 要実機検証 | 東家手前の写真で目視確認。誤ると全席90°ズレ |
| 2 | Agentic Vision の要否 | A/B検証 | 4分割後、素のFlashで足りるか |
| 3 | AI読み取り精度の実測 | 指標は実装済 / 実測は要画像 | 3指標の比較ロジックは `apps/api/src/eval/accuracy.ts`（evaluateKifu/aggregate）。実測はラベル付き画像20–30枚＋実 Gemini が必要 |
| 4 | UIコンポーネント共有手段 | 実装時決定 | Tamagui / RN Web / 自前SVG |
| 5 | ~~ORM選定~~ | **[決定] Drizzle** | スキーマ実装済み（`apps/api`）。[開発ガイド/05](開発ガイド/05_APIアーキテクチャ.md) |
| 6 | ~~カウンタ整合性の実装~~ | **[決定] 実装済み** | AnalysisStore=D1 batch で半荘/局/カウントを原子化 |
| 7 | 認証の具体実装 | 後回し | Google認証。Better Auth / Lucia 等 |
| 8 | ~~無料枠件数・月額価格~~ | **[決定] 実装済み** | free 20回/private4・Next¥480 100回・Pro¥1480 320回。Stripe サブスク（要鍵設定） |
| 9 | Web集客方針 | 未決定 | 共有URLのSEO要否（Next.jsなら対応可） |

---

## 10. 推奨開発順序

スキーマが全ての中心（背骨）。これを起点に縦の流れを1本通すと検証しやすい。

1. **`packages/schema` 確定**（済: `packages/schema/src/index.ts`）。
2. **河の単方向プロンプトを `AiRiverResponse` 形式に合わせて修正**。
3. **AI精度の実地テスト**（AI Studio で 河4分割＋正立 → 素Flash と Code Execution をA/B。TODO#1〜3を潰す）。← サービスの成否を握るのでここを最優先で固める。
4. 解析パイプライン（4分割 → 8画像 → Gemini → Zod検証 → 相対絶対変換 → Kifu組み立て）を Workers に実装。
5. 牌譜描画UI（SVG、confidenceハイライト、修正操作）を `packages/ui` に。
6. D1テーブル + 保存/閲覧。
7. Google認証 + 回数カウント + 月額（最後に外側として被せる）。

> 認証から作り始めない。**AI精度がサービスの成否を握る**ので、まず中核（撮影→解析→ドラフト→修正→JSON）を動かし、外側（認証・課金）は後から被せる。
