import { type Problem } from "@rigel/schema";
import { problemHandTiles } from "@rigel/ui";
import { OssTileFace } from "../OssTileFace";
import gc from "../game-card.module.css";

/** 何切るカードのサムネイル: 卓面の緑地に理牌済み手牌＋ツモ牌を並べる。
 *  「何の問題か」が一覧で一目で伝わるようにする（卓チップの置き換え）。 */
export function ProblemThumb({ problem }: { problem: Problem }) {
  const hand = problemHandTiles(problem);
  return (
    <div className={gc.thumb}>
      <span className={gc.ptiles}>
        {hand.map((t, i) => (
          <span key={i} className={gc.ptile}>
            <OssTileFace code={t} />
          </span>
        ))}
        {problem.kind === "discard" && problem.drawn && (
          <span className={`${gc.ptile} ${gc.pdrawn}`}>
            <OssTileFace code={problem.drawn} />
          </span>
        )}
      </span>
    </div>
  );
}
