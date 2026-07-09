# Plan: 課金アーキテクチャ RevenueCat 横串化（Web=Stripe / アプリ=IAP）

> 承認: 2026-07-08。関連: [タスク分解とPlan運用](../開発ガイド/03_タスク分解とPlan運用.md) / 設計ドキュメント7章

## 1. 目的（なぜ）

設計ドキュメント7章の3プラン課金を、**Web=Stripe（安い本命導線。広告・メール・LP はここへ誘導）／
アプリ=IAP（App Store / Play 経由で見つかった人の取りこぼし防止）**の2導線に広げ、
**どこで買っても同一アカウントで解放**する。ストア差異（StoreKit / Play Billing）と購読状態管理を
RevenueCat に吸収させ、自前の Apple 署名検証・（未実装の）Play 検証の保守をやめる。

## 2. ハーネス構成要素

**ツール（スキーマ）＋検証＋権限/制約**。外部（RevenueCat/Stripe/ストア）からの入力は全て
Zod 検証を通し、`users.plan` への反映だけを内部に許す。

## 3. スコープ

- やること:
  - エンタイトルメントの真実源を **RevenueCat** に一元化（Stripe 購読も RevenueCat の Stripe 連携へ流し込む）
  - `users.plan`（D1）は**射影（キャッシュ）**として維持 — 解析ごとの枠判定・保存上限判定は
    従来どおり D1 で完結（毎リクエスト外部照会しない）
  - RevenueCat Webhook 受け口（plan 反映・冪等）
  - mobile: `react-native-purchases` SDK + `logIn(userId)` + ペイウォール（iOS/Android 両対応）
  - 既存 App Store 直結実装（redeem / notifications / verifier / `appstore_original_transaction_id`）の
    **撤去**（未デプロイのため移行不要）
- やらないこと（非対象）:
  - 価格・枠の変更（¥480/¥1480・20/100/320 は現行のまま。IAP 価格は別価格になりうる → [未確定]）
  - 従量課金・買い切り・トライアル
  - web の Stripe Checkout / Portal フロー自体の変更（導線は現状維持）
  - アプリ内から web 決済への誘導 UI（アンチステアリング。§10）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`:
  - 3プラン（free/next/pro）・枠=Gemini 呼び出し数・成功時のみ加算（`recordGeminiCalls`）
  - private 上限プリフライト・鍵未設定は 501
- 触れる `[未確定]`（本実装の前に検証タスクを置く）:
  1. ~~RevenueCat×Stripe 連携の実挙動~~ → **[決定] 2026-07-09 sandbox 実測で確定**:
     - Stripe の新 **Sandboxes は独立アカウント**。sandbox ごとに RevenueCat Stripe アプリを
       インストールし、RevenueCat 側にも **sandbox 専用の Stripe config（Public API key も別）** を作る。
       本番用と2本立てが公式推奨（`REVENUECAT_STRIPE_PUBLIC_KEY` は環境ごとに別値）。
     - `POST /v1/receipts`（`X-Platform: stripe`・Bearer=strp_ キー・`fetch_token`=sub_...）で登録
       → 数秒で Webhook が届く。解約（即時）で CANCELLATION → EXPIRATION の順に着弾。
  2. ~~Webhook イベント→plan の写像~~ → **[決定] 実ペイロード採取済み**（`revenuecat-payloads/`）:
     - 封筒: `{ event: {...}, api_version: "1.0" }`。冪等キー `event.id`（UUID）。
       `app_user_id` / `entitlement_ids` / `environment`（"SANDBOX"|"PRODUCTION"）/ `store`（"STRIPE"…）。
     - 写像: INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE → entitlement に応じ next/pro。
       **EXPIRATION のみ free へ落とす**。CANCELLATION は自動更新オフ（期限まで有効）なので**何もしない**。
       未知イベント（**TRANSFER 含む**）は 200 で無視しログ。
  3. **Expo での SDK**: `react-native-purchases` は Expo Go 不可（dev build / EAS 必須）
  4. ~~IAP 価格~~ → **[決定] 2026-07-09**: App Store 掲載価格 Next **¥700** / Pro **¥1,800**
     （手数料転嫁。`planMonthlyPriceAppStore` の確定値テーブルとストア設定を一致させる）
  5. ~~エンタイトルメント識別子~~ → **[決定] `next` / `pro` に作り直し済み**（2026-07-09。
     採取時の "RIGEL Next" は識別子変更不可のため Entitlements を再作成）
  6. **TRANSFER（購読の別アカウント移動）の扱い**: 実ペイロード未採取・未実装。現状は
     「受けて無視」= 旧ユーザーの plan が期限まで残りうる（EXPIRATION 到達で free に収束）。
     `transferred_from`/`transferred_to` の実形を採取してから旧ユーザー free 化を実装する

## 5. 影響範囲 / アーキテクチャ

```
web (Next)   ── Stripe Checkout（現状のまま） ─▶ Stripe ──┐
                                                          ├─▶ RevenueCat（真実源）
mobile (Expo)── react-native-purchases ─▶ AppStore/Play ──┘        │ Webhook
                                                                   ▼
apps/api  POST /billing/revenuecat/webhook ─▶ User.changePlan ─▶ D1 users.plan（射影）
          （枠判定・上限判定は従来どおり users.plan で）
```

- 触る: `apps/api`（webhook ルート・usecase・Stripe webhook 拡張＝RC への receipt 登録・
  App Store 直結の撤去）/ `apps/mobile`（SDK・ペイウォール）
- スキーマ（背骨）への影響: なし（webhook スキーマは api 内 Zod）
- 依存追加（承認済み）: mobile `react-native-purchases`（dev build 前提）。api は REST（fetch）のみ
- 識別子: RevenueCat `app_user_id` = rigel `users.id`（Google 認証を web/app で共有済み → 横串の要）。
  **email 等の個人情報は RevenueCat に送らない**（CLAUDE.md ハードルール 7-2）

## 6. 信頼まわり（課金 = 必須）

- Zod 検証: RevenueCat Webhook payload / Stripe イベントとも parse してから使用。
  不明イベントは 200 で無視（再送地獄防止）しログ
- 認証: RevenueCat Webhook は Authorization 共有シークレット照合。鍵未設定なら 501（既存パターン踏襲）
- 冪等・整合: event id で重複適用防止。TRANSFER は `[未確定]`（§4-6。現状は受けて無視）
- 不変条件: `recordGeminiCalls`（成功時のみ加算）・枠/上限判定ロジックは一切触らない
- 画像非保存: 該当なし

## 7. 受け入れ条件（= 最初に書く失敗テストの集合）

- [x] RevenueCat Webhook（entitlement=next の INITIAL_PURCHASE）を受けると `users.plan` が next になる
- [x] EXPIRATION で free に戻る／同一 event id の再送は二重適用されない
- [x] Authorization 不一致は 401、鍵未設定は 501
- [x] Stripe `checkout.session.completed` 後、subscription id が RevenueCat に receipt 登録される
      （登録失敗でも plan 反映は壊れない）
- [x] mobile: ログイン後に `logIn(userId)` され、購入完了で plan が反映される
      （SDK 部はモック、結線は実機検証）
- [x] App Store 直結ルート（redeem / notifications）が撤去され、既存テストが RevenueCat 経路に置き換わる

> `[未確定]` 由来の条件（webhook の実ペイロード形）は、Task 1 の実測で期待値を確定してから Red にする。

## 8. Task 分解（1つ＝1つの振る舞い）

1. [x] **検証（人間と分担）**: sandbox 実測完了（2026-07-09。ペイロード3種採取・§4 に反映）
2. [x] api: Webhook payload の Zod スキーマ + event→plan 写像（`domain/billing/revenuecat.ts`）
3. [x] api: `POST /billing/revenuecat/webhook`（Authorization 照合 401・鍵未設定 501・event.id 冪等・
       SANDBOX 制御。D1 `revenuecat_events` + migration 0009）
4. [x] api: Stripe webhook 拡張（checkout 完了 → `HttpRevenueCatGateway` で fetch_token 登録。
       登録失敗でも plan 反映は維持）
5. [x] mobile: `react-native-purchases` + `lib/purchases.ts` ラッパ + auth の `logIn`/`logOut` 結線 +
       設定画面の購入/管理導線（expo-iap を撤去）。実機購入疎通は鍵設定・dev build 後
6. [x] 撤去: App Store 直結（routes / usecases / verifier / `appstore_original_transaction_id` +
       migration 0010。client の redeem も削除）
7. [x] 設計ドキュメント7章・CLAUDE.md 更新（構成図・鍵一覧）

## 9. 検証 / eval 方針

- ゲート: typecheck / lint / format / test（webhook・写像は unit で網羅）
- AI 精度 eval: 該当なし
- 実機: sandbox 購入 → webhook → plan 反映 → `/analyze` 枠拡大、の縦一筋を最後に疎通

## 10. リスク / 未決事項

- **アンチステアリング**: iOS アプリ内から「web の方が安い」への誘導は規約リスク。
  **アプリ内は IAP のみ提示**、安い web 価格の訴求は LP/メール/広告側で
  （日本のスマホ新法施行後に緩和を再検討）
- RevenueCat 障害時: plan は D1 射影なので**既存加入者の利用は継続**（新規購入のみ影響）
- RevenueCat 費用: MTR $2.5k/月まで無料 → 当面ゼロ円
- 過渡期の二重経路（既存 Stripe webhook 直反映 vs RC webhook）→ 最終形は
  「**RC webhook のみが plan を書く**」に寄せ、Stripe webhook は receipt 登録専任へ
- **既知の穴（2026-07-09 信頼ゲート監査より・非ブロッカー）**:
  - 冪等は event.id 単位のみで timestamp 比較なし → 別 event.id の古い RENEWAL が
    EXPIRATION の後に着弾すると plan が復活しうる（次の EXPIRATION で収束）。
    対策案: ユーザー単位で最終適用 event_timestamp_ms を記録し古いイベントを棄却
  - Webhook Authorization 照合（===）はタイミングセーフでない（シークレット長で実害小）
  - TRANSFER 未対応（§4-6 の [未確定]）

## 11. 完了の定義

- [x] 全受け入れ条件が緑
- [x] [04 検証とCIゲート](../開発ガイド/04_検証とCIゲート.md) のゲート通過
- [x] 信頼ゲート（/trust-check）通過
- [x] 確定した `[未確定]` は設計ドキュメント7章を更新済み
