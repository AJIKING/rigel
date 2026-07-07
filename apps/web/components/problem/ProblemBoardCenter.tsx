"use client";

import { type ProblemMeta } from "@rigel/schema";
import { problemRoundLabel } from "@rigel/ui";
import { OssTileFace } from "../OssTileFace";
import s from "./problem.module.css";

/** 何切るの卓中央（局・巡目・ドラ）。回答画面と編集プレビューで共用する。 */
export function ProblemBoardCenter({
  meta,
}: {
  meta: Pick<ProblemMeta, "roundWind" | "junme" | "dora">;
}) {
  return (
    <div className={s.centerInfo}>
      <div className={s.centerRound}>{problemRoundLabel(meta)}</div>
      {meta.dora.length > 0 && (
        <div className={s.centerDora}>
          {meta.dora.map((t, i) => (
            <span key={`${t}-${i}`} className={s.tile}>
              <OssTileFace code={t} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
