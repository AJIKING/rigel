// 特訓クイズの共有定数・文言（web/mobile の特訓画面で共有。表記ゆれ防止）。
// 出題生成ロジックは quiz.ts（清一色/牌効率）と quiz-score-question.ts（点数計算）に分離。

// 無料の特訓クイズ1日3回（FREE_QUIZ_PER_DAY）は課金ポリシーなので背骨（@rigel/schema の
// plan.ts）が単一真実源。ここでは文言の組み立てに使うだけで re-export しない
// （参照する側は @rigel/schema から直接 import する。2026-07-26 に経路を一本化）。
import { FREE_QUIZ_PER_DAY, QuizKindSchema, type QuizKind, type Tile } from "@rigel/schema";

/** 種目の一覧（背骨 QuizKindSchema.options から導出。種目選択カードの並び順もこれ）。 */
export const QUIZ_KINDS: readonly QuizKind[] = QuizKindSchema.options;

/** 1セッションの制限秒数（60秒タイムアタック）。 */
export const QUIZ_SESSION_SECONDS = 60;

/** 回答後に○×（正誤のみ・正答は見せない）を表示してから次問へ進むまでの時間（ミリ秒）。 */
export const QUIZ_FEEDBACK_MS = 500;

/** 開始成功から第1問までのカウントダウン秒数（3→2→1。この間 60 秒タイマーは動かさない・
 *  牌は見せない。[決定] 2026-07-25 オーナー指示の開始フロー）。 */
export const QUIZ_COUNTDOWN_SECONDS = 3;

/** ルール一文（開始ダイアログの種目名/説明の近くに出す。[決定] 2026-07-26 オーナー指示）。 */
export const QUIZ_RULE_NOTE = "60秒でできるだけ多くの問題に答える";

/** 種目の表示名（種目選択カード・結果画面で共用）。 */
export const QUIZ_KIND_LABELS: Record<QuizKind, string> = {
  chinitsu: "清一色 多面待ち",
  efficiency: "牌効率（受け入れ最大）",
  score: "点数計算",
  chinitsuUkeire: "清一色 何切る",
};

/** 種目の説明文（種目選択カードで共用）。「何をするか（＋ルール補足）＋何が鍛えられるか」を1行で伝える。
 *  ルール補足（完全一致/同率）はここに寄せ、出題中の指示文（QUIZ_KIND_PROMPTS）は最短にする。 */
export const QUIZ_KIND_DESCRIPTIONS: Record<QuizKind, string> = {
  chinitsu:
    "単色13枚のテンパイから待ち牌を全部見抜く（完全一致で正解）。多面待ちを読む速さを鍛える。",
  efficiency:
    "14枚から受け入れが最大になる1枚を切る（同率はどれでも正解）。手広く構える感覚を鍛える。",
  score: "牌姿から点数を即答する（鳴き・ドラあり）。点数計算を体で覚える。",
  chinitsuUkeire:
    "単色14枚から一番広くなる1枚を切る（テンパイなら待ち・1向聴なら受け入れが最大。同率はどれでも正解）。全部の切り方を同時に見る力を鍛える。",
};

/** 出題中の指示文（web/mobile の出題エリアで共用）。最短で（補足は QUIZ_KIND_DESCRIPTIONS に寄せる）。 */
export const QUIZ_KIND_PROMPTS: Record<QuizKind, string> = {
  chinitsu: "待ち牌を全部選ぶ",
  efficiency: "受け入れ最大の牌を切る",
  score: "点数を選ぶ",
  chinitsuUkeire: "一番広くなる牌を切る",
};

/** 種目カードの装飾（牌モチーフ3枚をファン状に。清一色=索子・牌効率=筒子・点数計算=三元牌）。
 *  装飾なので各画面は a11y から隠す。 */
export const QUIZ_CARD_MOTIF: Record<QuizKind, readonly Tile[]> = {
  chinitsu: ["3s", "5s", "7s"],
  efficiency: ["3p", "5p", "7p"],
  score: ["5z", "6z", "7z"],
  // 清一色=索子・牌効率=筒子・点数計算=三元牌 と重ならないよう萬子。
  chinitsuUkeire: ["3m", "5m", "7m"],
};

/** 無料枠を使い切ったとき（開始 API が 402）の文言。短く（枠と有料無制限のみ）。 */
export const QUIZ_LIMIT_MESSAGE = `本日の無料枠（${FREE_QUIZ_PER_DAY}回）を使い切りました。有料プランなら無制限です。`;

/** 開始 API が 402 以外で失敗したときの文言（web/mobile 共有）。 */
export const QUIZ_START_ERROR_MESSAGE = "開始できませんでした。少し待って再度お試しください。";

/** 結果送信の失敗文言（影響=この挑戦は記録に残らない、まで伝える。web/mobile 共有）。 */
export const QUIZ_SEND_ERROR_MESSAGE = "結果の送信に失敗しました。この挑戦は記録に残りません。";

/** マイページ「特訓」タブの空状態文言（web/mobile で共有）。 */
export const QUIZ_EMPTY_HISTORY_MESSAGE = "まだ特訓の記録がありません";

/** 一覧の取得に失敗したときの文言（web/mobile 共有）。**「0件」と混同させない** —
 *  空状態の案内を出すと、通信失敗が「まだ何も無い」に化けて利用者が気づけない。 */
export const LIST_LOAD_ERROR_MESSAGE =
  "読み込めませんでした。通信状況を確認して、画面を再読み込みしてください。";
