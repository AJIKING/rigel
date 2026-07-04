"use client";

import { RULE_PRESETS, type Rules } from "@rigel/schema";
import {
  matchPreset,
  RULES_FORM,
  RULE_PRESET_OPTIONS,
  type RuleSegKey,
  type RuleToggleKey,
} from "@rigel/ui";
import { useState } from "react";
import s from "./rules-dialog.module.css";

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
  const active = matchPreset(draft, RULE_PRESETS);

  const setToggle = (k: RuleToggleKey, v: boolean) => setDraft((d) => ({ ...d, [k]: v }) as Rules);
  const setSeg = (k: RuleSegKey, v: string) => setDraft((d) => ({ ...d, [k]: v }) as Rules);

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
            {RULE_PRESET_OPTIONS.map((p) => (
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
          {RULES_FORM.map((g) => (
            <div className={s.grp} key={g.title}>
              <h2>{g.title}</h2>
              {g.rows.map((row) => (
                <div className={s.row} key={row.key}>
                  <div className={s.rl}>
                    <div className={s.rt}>{row.title}</div>
                    <div className={s.rd}>{row.desc}</div>
                  </div>
                  {row.kind === "toggle" ? (
                    <label className={s.sw}>
                      <input
                        type="checkbox"
                        aria-label={row.title}
                        checked={draft[row.key]}
                        onChange={(e) => setToggle(row.key, e.target.checked)}
                      />
                      <span className={s.tr}>
                        <span className={s.kb} />
                      </span>
                    </label>
                  ) : (
                    <div className={s.segm}>
                      {row.options.map(([v, lbl]) => (
                        <button
                          key={v}
                          className={String(draft[row.key]) === v ? s.on : ""}
                          onClick={() => setSeg(row.key, v)}
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
