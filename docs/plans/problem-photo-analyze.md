# Plan: 何切る盤面の写真AI再現（problem-photo-analyze）

> 状態: **承認済み（2026-07-14）**。mobile を初回スコープに含める修正込み。
> 関連: [nanikiru.md](nanikiru.md) / [タスク分解とPlan運用](../開発ガイド/03_タスク分解とPlan運用.md)

## 1. 目的（なぜ）

「撮るだけで盤面がデータになる」というコアバリュー（設計ドキュメント1章）を何切る作成にも広げる。
実戦で「この場面、何切る？」と思った瞬間に撮影→AIがベース（手牌・河・ドラ）を再現→作者は修正と
解説だけ書いて出題できるようにする。牌譜解析ハーネス（M5）の資産を再利用し、新しいAI経路は作らない。

## 2. ハーネス構成要素

- **前処理/文脈供給**: 既存の撮影→解析パイプライン（河4分割＋正立・手牌単方向）をそのまま使う
- **ツール（スキーマ）**: AI出力は既存 `AiRiverResponse` / `AiHandResponse` で検証（新AIスキーマなし）。
  出口は既存 `ProblemSchema.parse`（保存時の最終ゲート）
- **権限・HITL**: AIはあくまで「ドラフト」。確定牌しか持てない `Problem` へは人の修正を必ず経由する

## 3. スコープ

- やること:
  - 写真（**自分の手牌=必須、河=任意**）から何切るドラフトを生成する API（**保存はしない**。ドラフトを返すだけ）
  - AIドラフト（Kifu 形）→ 何切る編集ドラフト（`ProblemDraft`）への純関数変換（`@rigel/ui`）
  - web（/problems/new）と mobile（ProblemEdit）の両方に「写真から作成」入口
  - 課金: 既存の Gemini 解析枠を消費（成功時のみ・実呼び出し数）。free は入口を出さない（既存方針）
- やらないこと（非対象）:
  - リアルタイム解析・動画（設計ドキュメント2章 非スコープ）
  - 点数の自動計算・AIによる正解/解説の自動生成（何切るは「正解を設けない」方針のまま）
  - 鳴き判断（call）問題の対象牌の自動特定（誰の直近打牌かは写真から判定不能。作者が編集で指定）

## 4. `[決定]` / `[未確定]` の仕分け

- 依拠する `[決定]`: 画像非保存 / 課金は成功時のみ・呼び出し数 / AI出力は Zod 検証・推測せず
  null+confidence / 何切るは正解なし・手入力ベース（nanikiru.md）
- 触れた `[未確定]` → **確定済み（2026-07-14）**:
  1. **[決定] 手牌が上限を超えて読めたら「読み順の末尾」をツモ欄に置く**（作者が直せる）。
     それでも入り切らない牌は省き、readingNotes で告げる（黙って捨てない）。
     テスト: packages/ui/src/problem.test.ts（kifuToProblemDraft）
  2. **[決定] `AnalysisInput.riverImage` を任意化**。河なしは河の読み取りをスキップし、
     呼び出し数にも数えない（過大請求しない）。テスト: gemini-analyzer.test.ts
  3. **[決定]（監査で追加）Problem は confidence を持てないため、低確信の牌は
     `review` として返し UI が「要確認: 1萬(0.4)…」と明示する**（確定牌への無言の昇格＝
     「自信満々の誤読」を防ぐ）。閾値は既存 REVIEW_CONFIDENCE_THRESHOLD（0.8）を共用

## 5. 影響範囲

- `packages/ui`: `kifuToProblemDraft(kifu, pov)` 追加（純関数）
- `apps/api`: `AnalyzeProblemDraft` ユースケース＋ `POST /problems/analyze`（multipart）。
  `rate-limit.ts` の RL_ANALYZE バケットに新パスを追加
- `packages/client`: `analyzeProblem(token, form)` 追加
- `apps/web`: /problems/new に写真モーダル（AddKyokuModal の写真部を流用）→ ドラフト流し込み
- `apps/mobile`: ProblemEdit に写真入口（CaptureScreen の画像選択部品を流用）→ ドラフト流し込み
- **スキーマ（背骨）への影響: なし**（既存スキーマを再利用。ここがこの設計の肝）
- 依存追加: なし

## 6. 信頼まわり

- **Zod 検証**: AI応答は既存パイプライン内で `Ai*ResponseSchema.parse`。API が返すドラフトは
  `KifuSchema.parse` 済みの形。保存時は従来どおり `ProblemSchema.parse` が最終ゲート
- **推測しない**: AIの null 牌はドラフト変換で落とし、**Problem には持ち込まない**（Problem は
  確定牌のみの世界）。readingNotes は画面に「読み取りメモ」として提示し、人の確認を促す
- **課金**: 成功時のみ `recordGeminiCalls(実呼び出し数)`（既存の原子適用を再利用）。失敗時は
  消費しない。free は `planCanAnalyze` で入口非表示＋API 側でも 403
- **画像非保存**: 解析後は破棄（既存パイプラインと同じ。ドラフトも保存しない）

## 7. 受け入れ条件（= 最初の Red）

- [x] `kifuToProblemDraft`: AIドラフトの手牌から null 牌を除いてドラフトに写す。上限超過なら
      末尾1枚をツモ欄へ、以下は手牌のみ。低confidence牌は review として返す
- [x] `kifuToProblemDraft`: 他家の河（tsumogiri 込み）・副露・ドラ・巡目を引き継ぐ。readingNotes を返す
- [x] `AnalyzeProblemDraft`: 解析成功で `{ kifu }` ドラフトを返し、game_logs / problems に行が増えない
- [x] `AnalyzeProblemDraft`: 成功時のみ解析カウントが実呼び出し数ぶん増える。Analyzer 例外なら増えない
- [x] `POST /problems/analyze`: 手牌画像なしは 400、free プランは 402（quota_exceeded。既存
      /analyze の reasonStatus と同一）、成功で 200＋ドラフト
- [x] web /problems/new: 「写真から作成」→ 解析成功でエディタの手牌・ツモ・河・ドラが埋まる
      （読み取りメモ・要確認の表示込み）
- [x] mobile ProblemEdit: 同様に写真→ドラフト流し込みができる（web と同一挙動）

## 8. Task 分解（順に TDD）

1. [ ] `@rigel/ui` に `kifuToProblemDraft`（変換＋ツモ振り分け規則をテストで固定。`[未確定]`①）
2. [ ] api: `AnalyzeProblemDraft` ユースケース（`[未確定]`② を確定してから。保存なし・課金整合）
3. [ ] api: ルート `POST /problems/analyze`（plan ゲート・画像検証・RL_ANALYZE）
4. [ ] client: `analyzeProblem` 追加（DTO・エラー形は analyze と同じ）
5. [ ] web: 写真モーダル＋エディタ流し込み（読み取りメモ表示込み）
6. [ ] mobile: 写真入口＋流し込み（変換・API は共有）
7. [ ] trust-check（AI出力・課金に触れるため信頼ゲート監査）

## 9. 検証 / eval 方針

- ゲート: 全パッケージの typecheck / lint / test（従来どおり）
- AI精度: 新しいプロンプトは作らないため既存 eval（M4 の3指標）を流用。何切る固有の追加 eval はしない

## 10. リスク / 未決事項

- 手牌写真の「ツモ牌が右端に分離されている」慣習を活かせるか（現行手牌プロンプトの出力順に依存）
  → eval で観察、必要ならプロンプト改良は別 Plan
- 解析枠の消費が「牌譜にならない用途」に広がる（意図どおりだが、枠の説明文言は確認）

## 11. 完了の定義

- [x] 全受け入れ条件が緑＋CI ゲート通過＋信頼ゲート（trust-auditor）通過
      （監査指摘の必須1件=低confidenceの要確認明示は対応済み。HTTP 層の free→402 テストは
      既存 /analyze と同じくユースケース層でのカバーに留める）
- [x] `[未確定]`①② の結論を本 Plan に `[決定]` として記録（§4）
