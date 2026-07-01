"use client";

import { RULE_PRESETS, type Rules } from "@rigel/schema";
import { useState } from "react";
import s from "./rules-dialog.module.css";

type ToggleKey =
  | "kuitan"
  | "atozuke"
  | "kiriage"
  | "kazoe"
  | "multiYakuman"
  | "compYakuman"
  | "noten"
  | "ryukyoku"
  | "tobi";
type SegKey = "aka" | "renchan" | "start" | "uma";

type Row =
  | { kind: "toggle"; k: ToggleKey; t: string; d: string }
  | { kind: "seg"; k: SegKey; t: string; d: string; opts: readonly (readonly [string, string])[] };

const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "基本",
    rows: [
      { kind: "toggle", k: "kuitan", t: "喰いタン", d: "鳴いたタンヤオを認める" },
      { kind: "toggle", k: "atozuke", t: "後付け", d: "役の後付け（片和了）を認める" },
      {
        kind: "seg",
        k: "aka",
        t: "赤ドラ",
        d: "各色の赤5の枚数",
        opts: [
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
      { kind: "toggle", k: "kiriage", t: "切り上げ満貫", d: "4飜30符・3飜60符を満貫に切り上げ" },
      { kind: "toggle", k: "kazoe", t: "数え役満", d: "13飜以上を役満扱い" },
      { kind: "toggle", k: "multiYakuman", t: "ダブル役満", d: "複数役満の倍加（2倍・3倍…）" },
      { kind: "toggle", k: "compYakuman", t: "役満の複合", d: "国士＋四暗刻など役満同士の複合" },
    ],
  },
  {
    title: "連荘・流局",
    rows: [
      {
        kind: "seg",
        k: "renchan",
        t: "親の連荘",
        d: "親が続く条件",
        opts: [
          ["agari", "和了連荘"],
          ["tenpai", "聴牌連荘"],
        ],
      },
      { kind: "toggle", k: "noten", t: "ノーテン罰符", d: "流局時に不聴の支払い（計3000点）" },
      {
        kind: "toggle",
        k: "ryukyoku",
        t: "途中流局",
        d: "九種九牌・四風連打・四家立直・四槓散了・三家和",
      },
    ],
  },
  {
    title: "対局",
    rows: [
      {
        kind: "seg",
        k: "start",
        t: "持ち点 / 返し",
        d: "開始点と返し点（オカの基準）",
        opts: [
          ["25000", "25000/30000"],
          ["30000", "30000/30000"],
        ],
      },
      {
        kind: "seg",
        k: "uma",
        t: "ウマ",
        d: "順位点（千点）",
        opts: [
          ["5-10", "5-10"],
          ["10-20", "10-20"],
          ["10-30", "10-30"],
        ],
      },
      { kind: "toggle", k: "tobi", t: "トビ終了", d: "持ち点が0未満で終局" },
    ],
  },
];

const PRESETS = [
  { key: "mleague", label: "Mリーグ" },
  { key: "tenhou", label: "天鳳" },
  { key: "free", label: "フリー" },
] as const;

/** 半荘ルールの設定ダイアログ。docs/rigel-rules-dialog.html を再現。
 *  プリセットで一括設定、個別トグル/セグメントで微調整。保存で onSave にルールを返す。 */
export function RulesDialog({
  rules,
  onClose,
  onSave,
}: {
  rules: Rules;
  onClose: () => void;
  onSave: (rules: Rules) => void;
}) {
  const [draft, setDraft] = useState<Rules>(rules);
  // 現在の draft がどのプリセットと一致するか（一致しなければカスタム）。
  const active =
    PRESETS.find((p) => JSON.stringify(RULE_PRESETS[p.key]) === JSON.stringify(draft))?.key ??
    "custom";

  const setToggle = (k: ToggleKey, v: boolean) => setDraft((d) => ({ ...d, [k]: v }) as Rules);
  const setSeg = (k: SegKey, v: string) => setDraft((d) => ({ ...d, [k]: v }) as Rules);

  return (
    <div className={s.overlay} onClick={onClose}>
      <div
        className={s.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="ルール設定"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.dhead}>
          <h1>ルール設定</h1>
          <button className={s.x} aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={s.dpre}>
          <div className={s.lbl}>プリセット</div>
          <div className={s.presets}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={active === p.key ? s.on : ""}
                onClick={() => setDraft(RULE_PRESETS[p.key])}
              >
                {p.label}
              </button>
            ))}
            <button className={active === "custom" ? s.on : ""} disabled>
              カスタム
            </button>
          </div>
        </div>

        <div className={s.dbody}>
          {GROUPS.map((g) => (
            <div className={s.grp} key={g.title}>
              <h2>{g.title}</h2>
              {g.rows.map((row) => (
                <div className={s.row} key={row.k}>
                  <div className={s.rl}>
                    <div className={s.rt}>{row.t}</div>
                    <div className={s.rd}>{row.d}</div>
                  </div>
                  {row.kind === "toggle" ? (
                    <label className={s.sw}>
                      <input
                        type="checkbox"
                        aria-label={row.t}
                        checked={draft[row.k]}
                        onChange={(e) => setToggle(row.k, e.target.checked)}
                      />
                      <span className={s.tr}>
                        <span className={s.kb} />
                      </span>
                    </label>
                  ) : (
                    <div className={s.segm}>
                      {row.opts.map(([v, lbl]) => (
                        <button
                          key={v}
                          className={String(draft[row.k]) === v ? s.on : ""}
                          onClick={() => setSeg(row.k, v)}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className={s.dfoot}>
          <button className={`${s.btn} ${s.ghost}`} onClick={onClose}>
            キャンセル
          </button>
          <button className={`${s.btn} ${s.primary}`} onClick={() => onSave(draft)}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
