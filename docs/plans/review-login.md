# Plan: ストア審査用アカウント（review account）

> 目的: App Store / Play ストア審査員が、コア機能（撮影→解析→保存）まで試せる
> ログイン手段を用意する。free プランは Gemini 枠 0 のため、審査員が自分で作った
> アカウントではコア機能を試せない。
> 方針 [決定 2026-08-01]: **案B = 合言葉ログイン `POST /auth/review`（実装済み）**。
> 当初採用した案A（専用 Google アカウント）はアカウント調達が頓挫し断念（案B節の
> 経緯を参照）。pro 化の D1 直書き手順など案Aの調査結果は案Bでも使うため残す。

## 案A（断念）: 専用 Google アカウント ＋ D1 直書きで pro 化

アプリのコードは一切変えない。運用手順のみ。

### 手順

1. **審査用アドレスを plaria.co.jp の「デフォルトルーティング」で用意**（ライセンス
   不要・無料。[決定 2026-07-31] gmail.com ではなく会社ドメインを使う。他サービスでも
   使い回せる）。
   - 例: `play-review@plaria.co.jp`（App Store 用に分けるなら `appstore-review@` も）。
   - **グループは使えない**（試して弾かれた）: グループのアドレスは Google の
     ディレクトリ上の識別子になるため、consumer アカウントのサインアップで
     「このユーザー名は既に使用されています」になる。
   - 設定: 管理コンソール → アプリ → Google Workspace → Gmail → ルーティング →
     デフォルトのルーティング → 「単一の受信者」= 審査用アドレス →
     「メールを変更 → 封筒の受信者を変更」で自分のアドレスへ配送 →
     「認識されないアドレスにのみ適用」。
   - アドレスはディレクトリに存在しないままメールだけ届く状態になる
     （モデレーション・投稿権限の罠なし）。
   - **迷惑メール判定に注意**: 外部からの確認コードは自分の受信箱の迷惑メール
     フォルダに落ちることがある（グループ方式の検証時に実際に落ちた）。
2. **そのアドレスで consumer Google アカウントを作成**（Workspace ライセンス外・無料）。
   - シークレットウィンドウで accounts.google.com/signup →
     「代わりに現在のメールアドレスを使用」→ グループのアドレス → 確認コード入力。
   - 2FA オフのまま・再設定用メールに自分の plaria アドレス・資格情報は
     パスワードマネージャ管理。生年月日は18歳以上。
   - このアカウントは Workspace の管理外（unmanaged/conflicting account）になる。
     管理コンソールから削除・リセットは不可。同アドレスで Workspace ユーザーを
     作ると衝突するので作らない。
3. **自分の端末でアプリから Google ログイン**し、ユーザー行を作らせる。
   その後、複数の端末・ネットワークから何度かログインして「新しい端末からの
   ログイン」チャレンジの発火率を下げておく。
4. **user id を確認**:
   ```
   wrangler d1 execute <DB名> --remote --command \
     "SELECT id, handle, plan FROM users WHERE email='play-review@plaria.co.jp'"
   ```
5. **plan を直接 pro に**:
   ```
   wrangler d1 execute <DB名> --remote --command \
     "UPDATE users SET plan='pro', plan_store='PROMOTIONAL' WHERE id='<id>'"
   ```
6. **サンプルデータ投入**: 審査ユーザーで半荘・何切るを数件作成（審査員が
   空画面を見ないように）。handle/表示名をわかりやすく変更（任意）。
7. 両ストアの審査メモにアカウント（メール＋パスワード。「Google でサインイン」を
   使う旨）を記載。

### この方法が成立する根拠（確認済み）

- モバイルのプラン表示・解析枠は `/me` の `users.plan`（D1 射影）だけを見る
  （SettingsScreen は `user?.plan`。RevenueCat SDK の CustomerInfo には依存しない）。
  → D1 直書きで表示と枠の両方が揃う。
- `plan_store='PROMOTIONAL'` は `isStoreManagedSubscription` が未知 store を
  安全側（ストア管理扱い）に倒すため、web 設定画面が Stripe ポータルへ誘導して
  404 になる事故は起きない（packages/ui の判定テストで確認）。
- 審査員が sandbox で IAP 購入テストをしても、本番は `REVENUECAT_ALLOW_SANDBOX`
  未設定 = SANDBOX イベント無視なので、手動設定した plan は上書きされない。
- plan≠free のためアカウント削除は 403 → 審査員の誤操作でデモデータが消えない
  （むしろ保護として機能）。

### ルールとの整合

「Webhook だけが plan を書く」（CLAUDE.md ハードルール6/課金設計）は**コードパスの
規律**であり、本件はコード外の運用オペレーション（一時的な審査対応）として例外扱いする。
- 将来この user 宛の RevenueCat 本番イベントが届けば真実源側で上書きされるが、
  審査アカウントは実購入しないので実質発生しない。
- 審査完了後は `UPDATE users SET plan='free', plan_store=NULL` で戻す（任意。
  再審査・アップデート審査に備えて維持してもよい。維持する場合はこのファイルに
  アカウントと user id をメモしない＝credentials はパスワードマネージャ管理）。

### 審査メモに書く内容（両ストア共通）

- デモアカウント: メール＋パスワード（Google でサインイン）。
- このアカウントは pro プラン相当で、撮影→AI解析→牌譜保存の全機能を試せること。
- サインインなしでも公開牌譜・何切るの閲覧は可能なこと（ゲスト導線あり）。
- IAP のテストは任意の sandbox アカウントで可能なこと。

### 残リスク（案Aの弱点）

**Apple の審査環境からの Google OAuth が「不審なログイン」判定で弾かれる**事故は
防ぎ切れない（既知の頻出リジェクト要因）。上記手順1の事前ログインで発火率は下がるが、
それでも弾かれてリジェクトされたら案Bを実装する。

## 案B（採用・実装済み 2026-08-01）: 合言葉ログイン `POST /auth/review`

> [決定 2026-08-01] 案Aは断念して案Bを実装した。経緯: 審査用 Google アカウントの
> 調達が連続で頓挫（①グループのアドレスは Google の識別子でありサインアップと衝突 /
> ②削除済みアドレスは長期間予約される / ③consumer サインアップの電話番号認証は
> 1番号あたりの上限で弾かれる / ④余剰の既存 Gmail は Play Console 紐付きで流用不可
> = パスワードを審査員に渡せず 2FA も外せない）。加えて案Aは成功しても
> 「Apple 審査環境からの Google ログインチャレンジ」リスクが審査のたびに残る。
> 案Bは Google アカウント自体を不要にし、このリスクごと消す。

実装済みの構成（下記のとおり。テストは各層のテストファイルに追加済み）:

1. **env.ts**: `REVIEW_LOGIN_SECRET?: string`（Secret）。未設定なら口は 501
   （`appleAuthEnabled` と同じ流儀）。審査後は Secret 削除で完全に閉じる。
2. **usecase** `AuthenticateWithReviewCode`: code を SHA-256 ダイジェスト比較
   （不一致は throw → respondAuth が 401 化）→ `findOrCreateUser` を合成 sub
   （`googleSub: "review:store"`。Google の実 sub は数字列なので衝突しない・
   スキーマ変更なし）で呼び冪等に同一ユーザーへ → `session.issue`。
3. **route** `POST /auth/review`（account.routes.ts・respondAuth 再利用）＋
   composition-root 配線。レート制限は既存 RL_WRITE（未ログイン POST = IP 単位）が
   自動で効く。
4. **@rigel/client**: `authWithReviewCode(code)`（authWithApple と対称）。
5. **mobile**: LoginScreen の BrandMark 長押し（600ms）でコード入力欄
   （インライン TextInput。Alert.prompt は iOS 専用のため不採用）→
   lib/auth の `signInWithReviewCode` 経由でサインイン。
- 隠しUIだが審査には隠さない: 両ストアの審査メモに「ロゴ長押し→コード入力」と
  手順・コードを明記（Apple 2.3.1 の「隠し機能」扱い回避）。
- pro 化は案Aと同じ D1 直書きでよい（RevenueCat Promotional Entitlement は
  Webhook イベント種別が `GRANT_EVENTS` 外（NON_RENEWING_PURCHASE 見込み）で
  現状 plan に反映されないため使わない）。
- 計測: login/sign_up の method に `review` を追加（@rigel/ui の LoginMethod）。

### 運用手順（審査提出前）

1. `wrangler secret put REVIEW_LOGIN_SECRET`（32文字以上のランダム値）。
2. 実機アプリでロゴ長押し → コード入力でログインし、審査ユーザーを作成。
3. D1 で pro 化（審査ユーザーは email なしなので googleSub で引く）:
   ```
   wrangler d1 execute <DB名> --remote --command \
     "SELECT id, handle, plan FROM users WHERE google_sub='review:store'"
   wrangler d1 execute <DB名> --remote --command \
     "UPDATE users SET plan='pro', plan_store='PROMOTIONAL' WHERE google_sub='review:store'"
   ```
4. 審査ユーザーでサンプルの半荘・何切るを数件投入。handle/表示名を整える（任意）。
5. 両ストアの審査メモに記載: 「ログイン画面のロゴ（牌と RAISHA のマーク）を
   約1秒長押し → 『審査コード』欄が出る → `<コード>` を入力 → コードでサインイン。
   このアカウントは pro 相当で撮影→AI解析→保存の全機能を試せる。サインインなしでも
   公開牌譜・何切るの閲覧は可能」。
6. 審査完了後: `wrangler secret delete REVIEW_LOGIN_SECRET` で口を閉じる（501 に戻る。
   アップデート審査のたびに 1 で再設定）。

### コストと IAP 審査の注意

- 審査ユーザーの pro はサブスク契約を伴わない（D1 フラグのみ）。実費は審査員が
  解析を試したときの Gemini 従量課金だけ（上限 = pro 枠 320回/月）。
- **審査ユーザーは pro のためアップグレード導線が出ない。** IAP フローの審査は
  審査員自身の新規アカウント（free）で行われる。審査メモに「購入フローは
  新規アカウントで確認可」と書き分ける。
- **sandbox 購入は本番では plan に反映されない**（`REVENUECAT_ALLOW_SANDBOX` 未設定
  = SANDBOX イベント無視）→「買ったのに解放されない」と見えるリジェクトリスク。
  審査期間中だけ `REVENUECAT_ALLOW_SANDBOX=true` を設定する選択肢がある。
  副作用: sandbox サブスクは短時間で失効し plan が free に戻る（審査ユーザー上で
  購入されると手動 pro も上書き→free 化されうる。審査後に D1 UPDATE で戻す）。
- 購入経路の実機疎通（sandbox 購入 → RevenueCat Webhook → plan 反映）はオーナーが
  確認済み（2026-08-01）。審査で IAP の動作確認を求められた場合にのみ、上記の
  `REVENUECAT_ALLOW_SANDBOX=true` を用意する方針。

## やらないこと

- 審査ユーザー専用の plan バイパスをコードに書く（plan を書くコードパスは
  Webhook の専権のまま）。
- 汎用の email/password 認証。
- RevenueCat Promotional Entitlement 経由の付与（上記のとおり現行 Webhook 処理に
  乗らない。必要になったら `GRANT_EVENTS` 拡張とセットで再検討）。
