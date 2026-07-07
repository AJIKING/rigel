"use client";

import { type ProblemMeta } from "@rigel/schema";
import { problemRoundLabel } from "@rigel/ui";
import { OssTileFace } from "../OssTileFace";
import s from "./problem.module.css";

/**
 * 何切るの卓中央。局は選べない（存在しない）ため、牌譜の「東1局」の位置に
 * 「東場 6巡目」を出し、その下に本場・供託とドラを添える（牌譜ビューアと同じ密度）。
 * 回答画面と編集プレビューで共用する。
 */
export function ProblemBoardCenter({
  meta,
}: {
  meta: Pick<ProblemMeta, "roundWind" | "junme" | "dora" | "honba" | "kyotaku">;
}) {
  return (
    <div className={s.centerInfo}>
      <div className={s.centerRound}>{problemRoundLabel(meta)}</div>
      {(meta.honba > 0 || meta.kyotaku > 0) && (
        <div className={s.centerSub}>
          {meta.honba > 0 && `${meta.honba}本場`}
          {meta.honba > 0 && meta.kyotaku > 0 && " ・ "}
          {meta.kyotaku > 0 && `供託${meta.kyotaku}本`}
        </div>
      )}
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
