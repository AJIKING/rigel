// @rigel/ui — 半荘ルール設定フォームの共有定義（プラットフォーム非依存）。
// web の RulesDialog / mobile の RulesSheet が同じグループ・項目・選択肢を描く。
// レンダリング（Switch/Segment 等）は各アプリ側。ここは「何を出すか」の設定だけ。

import { RULE_PRESETS, type Rules } from "@rigel/schema";

type PresetKey = keyof typeof RULE_PRESETS;

/** boolean で切り替える Rules キー。 */
export type RuleToggleKey =
  | "kuitan"
  | "atozuke"
  | "kiriage"
  | "kazoe"
  | "multiYakuman"
  | "compYakuman"
  | "noten"
  | "ryukyoku"
  | "tobi"
  | "doubleRon"
  | "tripleRon";

/** 択一（セグメント）で選ぶ Rules キー。 */
export type RuleSegKey = "aka" | "renchan" | "start" | "uma";

export type RuleRow =
  | { kind: "toggle"; key: RuleToggleKey; title: string; desc: string }
  | {
      kind: "seg";
      key: RuleSegKey;
      title: string;
      desc: string;
      options: readonly (readonly [string, string])[];
    };

export interface RuleGroup {
  title: string;
  rows: RuleRow[];
}

// 型チェック用: key はすべて Rules の実在キー。値の型（boolean/string）は各行の kind と一致する。
export const RULES_FORM: RuleGroup[] = [
  {
    title: "基本",
    rows: [
      { kind: "toggle", key: "kuitan", title: "喰いタン", desc: "鳴いたタンヤオを認める" },
      { kind: "toggle", key: "atozuke", title: "後付け", desc: "役の後付け（片和了）を認める" },
      {
        kind: "seg",
        key: "aka",
        title: "赤ドラ",
        desc: "各色の赤5の枚数",
        options: [
          ["none", "なし"],
          ["1", "各1枚"],
          ["2", "各2枚"],
        ],
      },
    ],
  },
  {
    title: "満貫・役満",
    rows: [
      { kind: "toggle", key: "kiriage", title: "切り上げ満貫", desc: "4飜30符・3飜60符を満貫に" },
      { kind: "toggle", key: "kazoe", title: "数え役満", desc: "13飜以上を役満扱い" },
      {
        kind: "toggle",
        key: "multiYakuman",
        title: "ダブル役満",
        desc: "複数役満の倍加（2倍・3倍…）",
      },
      {
        kind: "toggle",
        key: "compYakuman",
        title: "役満の複合",
        desc: "国士＋四暗刻など役満同士の複合",
      },
    ],
  },
  {
    title: "同時和了",
    rows: [
      { kind: "toggle", key: "doubleRon", title: "ダブロン", desc: "1つの捨て牌で2人が同時和了" },
      {
        kind: "toggle",
        key: "tripleRon",
        title: "トリプルロン",
        desc: "3人同時和了（無効なら三家和で流局）",
      },
    ],
  },
  {
    title: "連荘・流局",
    rows: [
      {
        kind: "seg",
        key: "renchan",
        title: "親の連荘",
        desc: "親が続く条件",
        options: [
          ["agari", "和了連荘"],
          ["tenpai", "聴牌連荘"],
        ],
      },
      {
        kind: "toggle",
        key: "noten",
        title: "ノーテン罰符",
        desc: "流局時に不聴の支払い（計3000点）",
      },
      {
        kind: "toggle",
        key: "ryukyoku",
        title: "途中流局",
        desc: "九種九牌・四風連打・四家立直・四槓散了・三家和",
      },
    ],
  },
  {
    title: "対局",
    rows: [
      {
        kind: "seg",
        key: "start",
        title: "持ち点 / 返し",
        desc: "開始点と返し点（オカの基準）",
        options: [
          ["25000", "25000/30000"],
          ["30000", "30000/30000"],
        ],
      },
      {
        kind: "seg",
        key: "uma",
        title: "ウマ",
        desc: "順位点（千点）",
        options: [
          ["5-10", "5-10"],
          ["10-20", "10-20"],
          ["10-30", "10-30"],
        ],
      },
      { kind: "toggle", key: "tobi", title: "トビ終了", desc: "持ち点が0未満で終局" },
    ],
  },
];

/** ルールプリセットの選択肢（RULE_PRESETS のキーと表示名）。
 *  フリーはカスタムと実質同義のため一覧には出さない（RULE_PRESETS には残す）。 */
export const RULE_PRESET_OPTIONS: readonly { key: PresetKey; label: string }[] = [
  { key: "mleague", label: "Mリーグ" },
  { key: "tenhou", label: "天鳳" },
];

/** 現在のルールが一致するプリセットのキー（無ければ "custom"）。 */
export function matchPreset(rules: Rules, presets: Record<PresetKey, Rules>): string {
  const target = JSON.stringify(rules);
  return (
    RULE_PRESET_OPTIONS.find((p) => JSON.stringify(presets[p.key]) === target)?.key ?? "custom"
  );
}

/** 一致するプリセットの表示名（無ければ「カスタム」）。ビューアの見出しで使う。 */
export function rulePresetLabel(rules: Rules): string {
  const key = matchPreset(rules, RULE_PRESETS);
  return RULE_PRESET_OPTIONS.find((p) => p.key === key)?.label ?? "カスタム";
}

/** ルールの読み取り専用表示行（項目名＋値ラベル）。RULES_FORM から導出するため、
 *  フォームの項目定義と表示が乖離しない。ビューアの情報パネル（web/mobile）で使う。 */
export function ruleSummaryRows(rules: Rules): { title: string; value: string }[] {
  return RULES_FORM.flatMap((g) => g.rows).map((row) => ({
    title: row.title,
    value:
      row.kind === "toggle"
        ? rules[row.key]
          ? "あり"
          : "なし"
        : (row.options.find(([v]) => v === String(rules[row.key]))?.[1] ?? String(rules[row.key])),
  }));
}
