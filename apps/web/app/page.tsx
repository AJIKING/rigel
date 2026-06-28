import { TILE_VALUES, type ReadTile } from "@rigel/schema";
import { needsReview } from "@rigel/ui";

// 共有パッケージのデモ:
//  - 背骨スキーマ(@rigel/schema)の牌種を参照
//  - confidence の低い/読めなかった牌は @rigel/ui の判定で「要確認」ハイライト
const sampleReads: ReadTile[] = [
  { tile: "1m", confidence: 0.99 },
  { tile: "5p", confidence: 0.4 },
  { tile: null, confidence: 0 },
];

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>rigel — 麻雀牌譜</h1>
      <p>背骨スキーマの牌種数: {TILE_VALUES.length}</p>
      <ul>
        {sampleReads.map((read, i) => {
          const review = needsReview(read);
          return (
            <li
              key={i}
              data-testid={review ? "review" : undefined}
              style={{ color: review ? "crimson" : "inherit" }}
            >
              {read.tile ?? "??"}（confidence {read.confidence}）{review ? " ← 要確認" : ""}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
