# Plan: web/mobile パリティ対応

> 状態: **承認済み（2026-08-03 オーナー「基本的にすべて対応する方針」）**。
> 各フェーズの着手時に本書の該当設計を確認・必要なら更新してから実装する（オーナー指示）。
> 元ネタ: 2026-08-03 のパリティ監査（web/mobile の機能・挙動差の全量洗い出し）。

## フェーズ A: 不具合系（即対応）— **完了 2026-08-03**

- [x] web 対局日が保存されない → BoardEditor の日付欄 blur で `updateGame({createdAt})`
      （mobile と同じ API。形式検証 YYYY-MM-DD・回帰テストあり）
- [x] mobile の死んだ検索窓 → Toolbar に `search` prop を新設して配線。
      公開牌譜（タイトル+投稿者）・公開何切る（タイトル）で web と同一条件。
      search を渡さない画面には**検索欄自体を出さない**（見た目だけの UI を残さない）
- [x] 削除確認の文言統一 → `DELETE_CONFIRM`（@rigel/ui）に一元化
      （半荘=「配下のすべての局と元写真が削除され、元に戻せません。」/ 局 / 問題=回答分布の
      告知 / 解析下書き）。web の「2度押し」は説明ゼロのため廃止し、説明つき confirm に統一。
      web の「最後の1局」も無言 disabled をやめ理由を表示（mobile と同じ）

## フェーズ B: web の解析追従（設計）— **完了 2026-08-03**

mobile の `AnalysisJobProvider` 相当を web に移植する。**目的は3点**:
一覧バッジの自動反映 / タブ・リロードを跨ぐ追跡の復元 / 多重送信ガード。

- `apps/web/lib/use-analysis-job.tsx`（新設・Client Context）:
  - mobile 版の骨格を移植（`pollAnalysisOutcome` 共有・`settledCount`・`busy`・`start()` の
    同期予約）。永続化は SecureStore の代わりに **localStorage**（key: `rigel:pendingAnalysis`、
    `{jobId, startedAt, userId}`）。復元は AuthProvider のユーザー確定後に一度・userId 不一致は掃除
  - 多重タブ: `storage` イベントで他タブの開始を検知して busy に倒す（厳密なロックまでは
    しない。サーバー側 409 が最終ガード）
  - Provider は `app/layout.tsx` の AuthProvider 直下に配線
- `AddKyokuModal`: 202 後は**モーダル内で待たずに閉じて Provider に渡す**…は挙動変更が
  大きいので v1 は現行維持＋「閉じても解析は続きます（完了すると一覧に反映されます）」の
  注記を追加し、閉じたときに Provider へ引き継ぐ（start）。完了時 onDone はモーダルが
  生きていれば従来どおり
- `MyKifuScreen`: `settledCount` で refetch ＋ 一覧に processing バッジがある間は 5 秒
  ポーリング（何切る下書きと同じ方式）。再解析（retry）成功時も Provider に追わせる
- 送信前 busy ガード: AddKyokuModal（AI タブ）と retry ボタンに適用
  （文言は mobile と同じ「解析はひとつずつ実行できます。…」）

実装メモ（2026-08-03）: 上記のとおり実装。MyKifuScreen の refetch 効果と 5 秒ポーリング効果は
分離した（`hasProcessing` を取得効果の依存に入れると retry の楽観更新を即 refetch で潰すため）。
テスト: `apps/web/lib/use-analysis-job.test.tsx`（start 予約・ひとつずつ・永続化・復元・
別ユーザー掃除・failed でも settled）＋ AddKyokuModal（busy ガード・閉じたら引き継ぎ）＋
MyKifuScreen（retry→Provider 追従・busy ガード）。

## フェーズ C: web の半荘詳細相当（設計）— **完了 2026-08-03**

web には半荘詳細画面が無く、0局半荘が開けない。**専用ページは作らず**、
`/kifu/[gameId]` のリダイレクトを条件分岐にする:

- 局が1つ以上 → 従来どおり先頭局のエディタへ（変更なし）
- **0局** → 同ルートで軽量の「半荘ヘッダビュー」を表示:
  半荘名/対局日の編集・解析ステータス（解析中/失敗＋もう一度解析）・元写真・
  「＋ 局を追加」（AddKyokuModal）・半荘の削除。実装は `components/board/GameHeaderScreen.tsx`
  （BoardEditor から半荘メタ部を抽出 or 小さく新設。エディタ本体は読み込まない）
- 一覧の再解析条件を `kyokuCount===0` 限定から **`analysisStatus==="failed"` 全般**へ緩和
  （局がある半荘の追加解析失敗も救う）。エディタ側にも failed 時の「もう一度解析」を表示

実装メモ（2026-08-03): `GameHeaderScreen.tsx` を新設（`/kifu/[gameId]` で 0局なら表示。
局ができたら `router.replace` でエディタへ）。AddKyokuModal に `askSeat` prop（0局は参照できる
局が無いので手前席を選ばせる）。一覧の 0局カードはタップでヘッダビューへ遷移（インライン案内は
廃止）。削除ボタンは一覧では 0局限定のまま（局がある半荘はエディタ/ヘッダビューに寄せる）。
エディタの局操作欄に failed バナー＋「もう一度解析」（202 で Provider に追わせる）。

## フェーズ D: mobile の機能差（設計）— **完了 2026-08-03**

1. マイページ一覧（牌譜/何切る）に**検索＋公開状態フィルタ**: `MyListToolbar` に
   web MyListToolbar と同じ props（q/status）を追加。選択肢は web と同一定数を @rigel/ui へ
2. **統計ヘッダ**（牌譜数/公開数/★された数）: web の3枠を mobile のマイページに移植
3. **共有導線**: GameDetail に「共有」（公開時のみ OS シート・非公開時は公開を促す文言）
4. 公開ビューア（KifuPlayer）に **★ボタン**と（自分の牌譜なら）**編集導線**
5. **ユーザーページ**: `PublicUserScreen`（/u 相当。公開プロフィール+公開半荘一覧）を
   スタックに追加し、公開一覧カードの投稿者名からリンク
6. 何切る編集に**ルール設定**（web RulesDialog 相当 = 既存 RulesSheet を流用）
7. Capture の手入力に**局メタ（本場/供託/ドラ）**と free でも**手前席選択**
   （web AddKyokuModal の手動タブと同じ構成）

実装メモ（2026-08-03）: 全7項目実装済み。状態フィルタの選択肢は @rigel/ui の
`MY_KIFU_STATUS_OPTIONS` / `MY_PROBLEM_STATUS_OPTIONS` に一元化（web も同定数へ寄せた）。
mobile MyListToolbar は sort と同じ「現在値ボタン＋ボトムシート」で status を選ぶ。
KifuPlayer は `fav`（★）と `onEdit`（所有者のみ・半荘詳細へ）を props で受け、
PublicGameScreen が useFavorites/useAuth で配線。PublicUserScreen 新設
（route `PublicUser`、公開一覧カードの投稿者名バッジから遷移。KifuCard バッジに onPress 追加）。
ProblemEdit のルールは既存 RulesSheet を開くだけ（rules は元々 problem に保存されていた）。
Capture はルートを View+ScrollView に変えて TilePickerSheet（ドラ）を重ねる。
手入力の席は選択式になった（以前は東固定）。

## フェーズ E: その他

- web 設定に**購入反映待ちの案内**（Stripe Checkout から戻ったら /me を短時間ポーリングし
  「プランを反映しています…」。mobile SettingsScreen と同じ 30 秒打ち切り）
- 公開ビューアの情報パネル差（最終巡目行の mobile 追加）

## 備考

- 仕様どおりの差（対応しない）: 課金方式・価格表示（Stripe vs ストア）・OGP/SEO/LP=web・
  ゲスト/審査ログイン=mobile・全画面=web のみ・共有方式（コピー vs OS シート）
- mobile の変更はストア再ビルド（Codemagic）が必要
