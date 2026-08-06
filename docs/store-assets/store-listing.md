# ストア掲載情報（App Store / Google Play）

> 入稿用ドラフト（2026-07-31）。訴求方針 = クイズ・何切るがインストールのきっかけ
> （[決定] 2026-07-31。掲載順・スクリーンショットと同じ物語）。
> 価格はアプリ内課金のストア掲載価格（Next ¥700 / Pro ¥1,800）。web 価格には触れない
> （App Store の外部価格誘導の規約リスクを避ける）。

---

## App Store

### 名前（30字以内）

```
RAISHA - 麻雀 何切る・特訓・牌譜
```

（21字。検索対象なので主要キーワードを名前に含める）

### サブタイトル（30字以内）

```
解いて鍛えて、対局は撮るだけで牌譜に
```

（18字。案B:「麻雀クイズで上達、牌譜は撮るだけ」）

### プロモーション用テキスト（170字以内・随時変更可）

```
何切るは「みんなの回答分布」で答え合わせ。清一色や牌効率の60秒特訓で判断力を鍛えて、仲間との対局は写真を撮るだけでAIが牌譜に。麻雀がもっと楽しくなるアプリ、RAISHA。
```

（84字）

### 概要（4000字以内）

```
RAISHA（ライシャ）は、麻雀を「解いて・鍛えて・残す」アプリです。

■ 何切る — みんなの答えと比べる
・公開の何切る問題に回答して、みんなの回答分布と比べられます
・正解の押しつけはありません。リーチ・鳴き判断にも対応した、分布で答え合わせする何切るです
・自分の牌譜の一場面から、1タップで何切るを作って出題することもできます

■ 特訓 — 60秒で最速の判断
・清一色の何待ち、牌効率、点数計算を60秒タイムアタックで特訓
・多面待ちを読み切る力、受け入れ最大の一打を選ぶ感覚が身につきます
・正答数・正答率は毎日グラフになり、伸びがひと目でわかります

■ 牌譜 — 麻雀の記録を、撮るだけで
・実物の卓を撮るだけで、AIが盤面を読み取って牌譜を作成します
・仲間との対局やセットの記録がそのまま残り、一打一打を盤面で振り返れます

■ 共有 — 牌譜を送って、みんなで何切る
・牌譜はリンクひとつで共有。受け取った相手はサインインなしで閲覧できます
・気になる一打を何切るにして仲間に出題すれば、感想戦がもっと盛り上がります
・公開・非公開は半荘ごとに選べます

■ 料金
・見る・解く・鍛えるはずっと無料です
・RAISHA Next（月額700円）: AIによる牌譜再現 月100回・保存無制限
・RAISHA Pro（月額1,800円）: AIによる牌譜再現 月320回・保存無制限
・サブスクリプションは自動更新されます。解約はOSの購読設定からいつでも行えます

■ そのほか
・Mリーグ・天鳳ルールに対応した点数計算
・アカウントは iOS・Android・Web で共通

利用規約: https://raisha.jp/terms
プライバシーポリシー: https://raisha.jp/privacy
```

### キーワード（100字以内・カンマ区切り）

名前・サブタイトルの語（麻雀/何切る/特訓/牌譜/撮る）は重複させない。

```
クイズ,清一色,牌効率,点数計算,多面待ち,セット,雀荘,記録,対局,共有,上達,練習,問題,リーチ,雀力,カメラ,AI
```

（56字。残り枠は計測しながら追加）

---

## Google Play

### アプリ名（30字以内）

```
RAISHA - 麻雀 何切る・特訓・牌譜
```

### 簡単な説明（80字以内）

```
何切る・60秒特訓で雀力アップ。仲間との対局は写真を撮るだけでAIが牌譜に。
```

（37字。案B:「みんなの回答分布で答え合わせする何切ると、撮るだけで残る麻雀の牌譜」）

### 詳しい説明（4000字以内）

App Store の「概要」と同文を使う（Play はキーワード欄が無く説明文が検索対象のため、
「麻雀」「何切る」「牌譜」「清一色」「牌効率」「点数計算」等の語が本文に自然に
含まれていることが重要 — 上の概要は満たしている）。

---

## カテゴリ

両ストアとも **ゲーム > ボード**（麻雀アプリの定番棚。クイズ主導の訴求と一貫）。

- App Store: プライマリ = ゲーム（ボード + トリビア）/ セカンダリ = エンターテインメント
- Play: ゲーム > ボード
- 年齢レーティングの質問票で「疑似ギャンブル」は **なし** と回答する
  （賭け要素なし・点数はゲーム内スコアのみ。誤って「あり」にすると 17+/成人向けになる）。

## 審査用アカウント

> **2026-08-05 更新**: 旧案（レビュー専用 Google アカウント＋RevenueCat Granted Entitlements）は
> 断念し、**合言葉ログイン（案B・実装済み 2026-08-01）** に置き換えた。理由と運用手順の
> 真実源は [docs/plans/review-login.md](../plans/review-login.md)。
> （Google は 2FA/本人確認で共有アカウントが審査中にブロックされ得る。Promotional
> Entitlement は現行 Webhook の GRANT_EVENTS に乗らないため plan に反映されない。）

1. 提出前に `wrangler secret put REVIEW_LOGIN_SECRET`（32文字以上）を設定
2. 実機のログイン画面で**ロゴを長押し（600ms）**→ 合言葉入力でログインし、審査ユーザー
   （sub=`review:store`）を作成
3. D1 で `UPDATE users SET plan='pro', plan_store='PROMOTIONAL' WHERE google_sub='review:store'`
   （free は解析枠 0 のため、これが無いと審査官がコア機能＝AI 牌譜化に触れられない）
4. サンプル半荘・何切るを投入して初見の画面が空にならないようにする
5. 記載場所:
   - App Store Connect → App Review 情報: 「ログイン画面のロゴを長押し → コード欄が出る」
     手順＋合言葉。「Apple ID で即時新規登録可」「サインインなしでも公開牌譜・何切るは
     閲覧可（ゲスト）」も明記
   - Play Console → アプリのコンテンツ → アプリのアクセス権: 同じ手順・合言葉を登録
6. IAP の動作確認は審査官の Sandbox 購入で行われる旨を備考に記載
   （本番は SANDBOX イベントを無視する。審査期間中のみ `REVENUECAT_ALLOW_SANDBOX=true`
   にする判断は review-login.md のリスク節を参照）
7. **審査完了後に `wrangler secret delete REVIEW_LOGIN_SECRET`**（合言葉ログインを閉じる）

### 記入テンプレ（そのまま貼る。`<REVIEW_CODE>` を実際の合言葉に置換）

通常のユーザー名＋パスワードのアカウントが存在しないため、**認証情報欄には合言葉を書き、
備考欄で手順を説明する**（非標準ログインの定番の書き方。欄を空にすると差し戻される）。

**App Store Connect → App Review に関する情報**
- 「サインインが必要です」に**チェック**
- ユーザー名: `review`（形式上の値。実際の手順は備考参照）
- パスワード: `<REVIEW_CODE>`
- 備考（メモ）欄:

```
This app uses Google / Apple sign-in only, so instead of a username/password
account we provide a dedicated review login.

How to sign in as the review account:
1. On the login screen, long-press the app logo "RAISHA" (about 1 second).
2. A review-code input field appears.
3. Enter the code below and tap the sign-in button.
Review code: <REVIEW_CODE>

Notes:
- The review account is pre-loaded with sample game records and a paid (Pro)
  plan, so all core features (AI photo-to-game-record, quiz training, ranking)
  can be tested immediately.
- Public game records and quizzes can also be browsed WITHOUT signing in
  (guest mode), and a new account can be created instantly with Sign in with
  Apple.
- Subscriptions (Next / Pro) can be tested from Settings > 料金プラン via
  sandbox purchase.
```

**Play Console → アプリのコンテンツ → アプリのアクセス権**
- 「すべてまたは一部の機能が制限されている」を選択 → 認証情報を追加
- 手順名: `審査用ログイン（合言葉）`
- ユーザー名: `review` / パスワード: `<REVIEW_CODE>`
- その他の情報:

```
本アプリのサインインは Google / Apple のみのため、審査用に合言葉ログインを用意しています。
1. ログイン画面のロゴ「RAISHA」を約1秒長押し
2. 表示される「審査コード」欄に上記パスワード（合言葉）を入力してサインイン
※ 審査用アカウントにはサンプル牌譜と有料プラン（Pro）を設定済みで、全機能を試せます。
※ サインインなしでも公開牌譜・何切る・特訓はゲストとして閲覧/プレイできます。
```

**Play Console → アプリのコンテンツ → データセーフティ（アカウント削除）**
- 「ユーザーがアカウントと関連データの削除をリクエストする場合に使うリンク」:
  `https://raisha.jp/account-deletion`（専用ページ 2026-08-05 実装。ウェブからの削除手順・
  削除範囲・有料プラン中は先に解約が必要な旨を明記。**記入前に web の promote が必要**）
- 「一部のデータの削除をリクエストできるようにしていますか」→ はい
  （半荘・局・何切る・写真は個別に削除可能）

## 入稿時の注意

- ストア掲載名の変更: App Store Connect「アプリ情報 → 名前」/ Play Console
  「メインのストア掲載情報 → アプリ名」（バイナリの表示名 RAISHA とは別管理）
- スクリーンショット: `docs/store-assets/ios|play/`（01何切る → 02特訓 → 03牌譜 →
  04共有 → 05無料 + Play は feature-graphic）
- Play の「簡単な説明」はA/Bテスト（ストア掲載情報のテスト）が可能。案A/Bで試す価値あり
