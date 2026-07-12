# リリース前セキュリティ強化 — 対応方針と恒久設計

> 2026-07-12 のリリース前セキュリティ診断（認可 / 入力検証・XSS / 秘匿情報・セッション / 信頼ゲート / 乱用耐性の5観点）を受けた対応計画。
> 個別の穴を塞ぐだけでなく、**同じ種類の穴が二度と開かない構造**にすることを目的とする。
> 「何を直すか」ではなく「なぜその深さで直すか」を残す。

---

## 0. 診断サマリ（何が問題で、何は問題でなかったか）

**堅牢（対応不要・現状維持）**: 認可/IDOR（全ルート棚卸しで漏れゼロ）・private/draft の隔離・email 非露出（CLAUDE.md 7-2）・XSS/SQLi・秘密管理（鍵のコミット混入なし・Gemini 鍵はサーバ専用）・セッション（web=HttpOnly+BFF / mobile=SecureStore）・CORS 許可リスト・Stripe 署名検証・RevenueCat 冪等・画像非保存。

**要対応**: 下表。深刻度は「攻撃者の利得」ではなく **サービス継続性・課金整合・公開範囲の破れ** で測っている。

| # | 深刻度 | 症状 | 根本原因 |
|---|---|---|---|
| 1 | Critical | /analyze で作った局が常に `complete` で保存され、public 半荘なら**下書きが公開フィードに露出**。free の上限判定も狂う | 行マッピングが2箇所（repository と analysis store）に重複し、片方に `status` が抜けた。テストダブルが本物と乖離していて検出できなかった |
| 2 | High | レート制限が皆無（429 も CAPTCHA も無し） | 「量」に対する防御レイヤが設計に存在しない |
| 3 | High | kifu/problem JSON のサイズ・配列が無制限。body 上限も無し | スキーマが「形」は守るが「量」を守っていない |
| 4 | High | 解析カウンタが絶対値 SET で lost update。枠を超えて呼べる方向 | 永続化がドメインの最終状態を書き戻す設計（read-modify-write） |
| 5 | Medium | 公開フィード1回で最大 ~120 D1 クエリ＋200件の Kifu parse | 一覧が書き込みモデル（Kifu 全体）を読んでいる |
| 6 | Medium | /analyze の画像サイズ・MIME・枚数が未検証。枠判定より先にバッファ | 入口の検証と枠プリフライトの順序 |
| 7 | Medium | AI 応答で confidence 欠落が **1.0（自信満々）** に化ける | AI 応答スキーマが保存用スキーマ（人手入力向け default）を再利用 |
| 8 | Low | JWT algorithms 未固定 / 削除後トークン失効なし / webhook 非定数時間比較 / web セキュリティヘッダなし / checkout URL 未検証 / dev 依存の脆弱性 | 個別のハードニング |

**コードで判定不能（運用確認）**: `toAbsoluteSeat` の回転方向が [未確定] のまま（実機検証が要）／AI Gateway のキャッシュ・ログ設定（撮影画像が残らないか）。

---

## 1. 恒久設計 — 4つの構造的な手当て

個別修正の前に、**穴のクラスごと**に足場を作る。以下が「二度と同じ穴が開かない」ための本体。

### A. 永続化マッピングの単一真実源＋契約テスト（#1 の根治）

**問題の構造**: `GameLog`（ドメイン）→ D1 行 のマッピングが `DrizzleGameLogRepository.save` と `DrizzleAnalysisStore.commit` の2箇所に手書きで重複している。新しいカラム（status）が片方だけに足され、しかも**テストダブル（InMemoryAnalysisStore）が本物と違う挙動**（save 経由で status を保存）だったため、テストは緑のまま本番だけ壊れていた。

**設計**:
1. **行マッピングを1箇所に**: `infrastructure/kifu/game-log-row.ts` に `toGameLogRow(log): NewGameLogRow` / `toGameLog(row): GameLog` を置き、repository と analysis store の**両方がこれだけを使う**。カラム追加時に片方だけ漏れる余地を消す。
2. **DB 既定値に頼らない**: `game_logs.status` の `.default("complete")` を外す（`notNull()` のみ）。指定漏れが**保存時エラーで即死**するようにし、「黙って公開側に倒れる」最悪の失敗モードを排除する。既存行は移行不要（値は入っている）。
3. **契約テスト（Contract Test）**: `AnalysisStore` / `GameLogRepository` のポートに対し、**実装非依存のテストスイート**を1本書き、`Drizzle*`（実 SQLite）と `InMemory*`（テストダブル）の**両方に対して同じスイートを流す**。これでフェイクが本物から乖離した瞬間に落ちる。
   - 実 SQLite は既に `sql.js`（RevenueCat 冪等テストで導入済み）が使える。

> **原則として記録**: 「テストダブルは契約テストで本物と同じスイートを通す」。ダブルの独自実装は不変条件の抜け道になる。

### B. 「量」の防御レイヤ（#2 / #3 / #6）

現状、認証・認可（誰が）と検証（形は正しいか）はあるが、**量（どれだけ）に対する層が無い**。3段で入れる。

**B-1. スキーマに量の上限を持たせる（packages/schema = 単一真実源）**
`Kifu`/`Problem` の配列・文字列に麻雀のルール上ありえない値を弾く上限を置く。schema は全層（api・web・mobile）が共有するので、**1箇所直せば入口が全部塞がる**（api の検証、UI の入力制限、AI 出力の検証すべてに効く）。

```
KIFU_LIMITS = {
  hand: 14,       // 13 + ツモ牌
  melds: 5,       // 4副露 + 余裕
  river: 30,      // 実戦の最大打牌数（~24）に余裕
  timeline: 200,  // 4人×最大巡目に余裕
  yaku: 20, riichi: 4, tenpai: 4, dora: 5（既存）,
  readingNotes: 2000, note: 500, explanation: 2000, yakuName: 20,
  displayName: 30, title: 80（既存）, playerName: 20（既存）,
}
```
これは**セキュリティ対策であると同時にデータ品質のゲート**（麻雀としてありえない牌譜を保存させない）でもある。

**B-2. HTTP のボディ・ファイル上限（Hono `bodyLimit` ＋ /analyze の入口検証）**
- JSON ルート: 256KB（Kifu 1件の現実的上限の数倍）。超過は 413。
- `/analyze`: 画像は **1枚 8MB・最大5枚・MIME 許可リスト（jpeg/png/webp/heic）**。`File.size`/`File.type` は**バイトを読む前に**判定できるので、`arrayBuffer()` の前に弾く。
- 検証の順序を **認証 → 枠プリフライト → バイト読み込み** に変える（現状は先にバッファしている）。無料ユーザーが枠0でも巨大画像をメモリに載せられる経路を消す。

**B-3. レート制限（Cloudflare Rate Limiting binding）**
Workers の binding を使い、Hono ミドルウェアで層別に効かせる。**ポート（`RateLimiter` インターフェース）を domain 側に切り**、テストではフェイクを注入する（DDD の既存流儀に合わせる）。

| バケット | キー | 目安 |
|---|---|---|
| 公開読み取り（`/games/public`・`/problems`・`/users/*`・`/kifu/:id`） | IP | 60 req/min |
| 未認証 CPU 系（`POST /kifu/validate`） | IP | 10 req/min |
| 認証済み書き込み（PUT/POST/PATCH/DELETE 全般） | userId | 60 req/min |
| `/analyze` | userId | **6 req/min かつ同時1本**（#4 のオーバーシュートも実質的に抑える） |

超過は `429` + `Retry-After`。クライアント（web/mobile）は 429 を「混み合っています」の共通文言で扱う（`@rigel/ui` の既存エラーメッセージ関数に追加）。

### C. カウンタは「最終状態の書き戻し」ではなく「差分の原子適用」（#4 の根治）

**問題の構造**: `User` ドメインが `recordGeminiCalls` で内部カウンタを進め、store が**その絶対値を SET** している（read-modify-write）。並行 /analyze が同じ値を読むと片方の消費が消える（＝**枠より多く呼べる＝コストが出る方向**の取りこぼし）。

**設計**: ドメインの純粋さは保ったまま、**永続化の表現を「差分」に変える**。
- `AnalysisCommitInput.user`（User 全体）→ `counter: { userId, calls, now, nextResetAt }` に置き換える。
- D1 では**単一 UPDATE 文**で月リセットと加算を同時に表現する（batch 内の1文なので原子的）:

```sql
UPDATE users SET
  analysis_count_this_month =
    CASE WHEN count_reset_at <= ?now THEN ?calls
         ELSE analysis_count_this_month + ?calls END,
  count_reset_at =
    CASE WHEN count_reset_at <= ?now THEN ?nextResetAt
         ELSE count_reset_at END
WHERE id = ?userId
```

- 月境界のリセット判定（`firstOfNextMonthUtc`）は**ドメインが計算し、SQL は適用するだけ**（ロジックの二重実装を避ける）。
- 残る **TOCTOU のオーバーシュート**（枠チェック→解析→計上の隙間で並行リクエストが通る）は、**「最大 同時実行数 × 8 呼び出し」に有界**であり、B-3 の `/analyze` 同時1本制限で実質的に抑える。これを **[決定] として設計ドキュメントに明記**する（「枠は厳密な上限ではなく、有界のオーバーシュートを許容する」）。曖昧なまま放置しない。

> CLAUDE.md 5節の `[未確定]`「カウンタ整合の原子化」は、この設計で `[決定]` に更新する。

### D. 一覧は読み取りモデルを分ける（#5）

**問題の構造**: 公開フィードが `SELECT *`（Kifu JSON 込み）で200行取り、全行に `KifuSchema.parse` を掛けている。**コストが保存された JSON サイズに比例**するので、B-1 の上限と合わせても一覧の重さが残る。

**設計**: リポジトリに**一覧専用の射影メソッド**を足す（CQRS-lite）。
- `listPublicSummaries(limit)`: `id, gameId, userId, seq, createdAt` **だけ**を SELECT（kifu カラムを読まない・parse しない）。
- 半荘・著者の N+1（`findById` を件数分）は `IN (...)` の一括取得に置き換える。
- 公開プロフィール（`getPublicProfile`）も同様に、半荘ごとの全局 parse をやめて件数だけ数える。

一覧に Kifu 本体は要らない、という当たり前の分離。**これで公開エンドポイントのコストが「保存内容」から切り離される**（乱用の増幅係数が消える）。

---

## 2. 個別対応（上の足場に乗せる）

### 信頼ゲート（AI）

- **#7 confidence 必須化**: `AiReadTileSchema` / `AiDiscardSchema` を保存用スキーマから分離し、`confidence` を **required**（default なし）にする。モデルが省略したら**検証で落とす**（1.0 に化けさせない）。これは「自信満々の誤読を出さない」という最優先指標の直接の担保であり、Medium ではなく**信頼ゲートの本丸**として扱う。
- **AI の notes を捨てない**: `assembleKifu` が各方向の `notes` を `readingNotes` に方向ラベル付きで連結する（グレア・ブレ等の手がかりが人手修正に届く）。

### ハードニング（#8・Low。リリース後でも可だが安いので同梱推奨）

- JWT `jwtVerify` に `algorithms: ["HS256"]` を明示。
- RevenueCat webhook の共有秘密を**定数時間比較**（`crypto.subtle` ベース）＋ 32バイト以上のランダム値を運用手順に明記。
- `displayName` に上限（B-1 に含む）。
- checkout/portal の `successUrl`/`cancelUrl`/`returnUrl` を **`ALLOWED_ORIGINS` ＋ アプリ scheme のホワイトリスト**で検証。
- web に セキュリティヘッダ（`X-Frame-Options: DENY` / `Referrer-Policy` / `X-Content-Type-Options`）。
- `DeleteAccount` を D1 batch で1トランザクション化（部分失敗の孤児を消す）。
- dev 依存の更新（vitest Critical / tar High。本番バンドル外だが CI の供給網リスク）。
- アカウント削除後のトークン失効: **書き込み系ミドルウェアでユーザー存在確認**（削除済み userId のトークンで孤児データを作れない）。トークン失効リストは持たない（ステートレスを維持）。

### 運用（コードでは解けない）

- **`toAbsoluteSeat` の回転方向を実機検証 → 設計ドキュメントを `[決定]` に更新**（ズレると全席90°回転で読み取りが壊れる。リリース前必須）。
- **AI Gateway のキャッシュ/ログ設定を確認**（撮影画像がゲートウェイ側に残らないこと。「画像を保存しない」は Workers 内だけでは完結しない）。
- Gemini のモデル名を AI Studio の現行に合わせる（設計4章「Gemini 3 Flash」と wrangler.toml の値が不一致）。

---

## 3. 進め方（フェーズ）

各フェーズは TDD（Red→Green）で、フェーズごとに検証ゲート（typecheck/lint/test/build）を通してコミットする。

| Phase | 内容 | リリース |
|---|---|---|
| **P1** | #1 Critical（行マッピング統合＋DB既定値撤去＋契約テスト） | **ブロッカー** |
| **P2** | B-1 スキーマの量上限 ／ B-2 body・画像上限＋枠プリフライト順序 | **ブロッカー** |
| **P3** | B-3 レート制限（ポート＋Cloudflare binding＋429 の UI 文言） | **ブロッカー** |
| **P4** | C カウンタ原子化（差分 UPDATE）＋ 並行テスト＋ [決定] 記録 | **ブロッカー** |
| **P5** | #7 confidence 必須化＋notes 引き継ぎ ／ D 一覧の射影 | 強く推奨 |
| **P6** | ハードニング一式（#8） | リリース後可 |
| **P7** | 運用確認（座席回転の実機検証・AI Gateway 設定・モデル名） | **ブロッカー**（コード外） |

**最短のリリース条件**: P1〜P4 ＋ P7。P5 は AI 精度の信頼性に直結するので、解析機能を売りにする以上は同時に入れたい。

---

## 4. この計画で「入れないもの」（意図的な非対応）

- **WAF/CAPTCHA の全面導入**: レート制限（B-3）で足りる規模。過剰。
- **トークン失効リスト（ブラックリスト）**: ステートレス JWT の利点を捨てる割に、削除後の実害が「孤児データ」だけ。書き込み時のユーザー存在確認で足りる。
- **枠の厳密な排他（分散ロック）**: オーバーシュートは有界で、コストへの影響は限定的。複雑さに見合わない。**許容することを [決定] として明記**する方が正しい。
