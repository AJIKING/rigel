// 何切るカードの牌姿プレビュー（理牌済み手牌＋ツモ牌）。一覧で「何の問題か」が
// 一目で分かるようにする（web の ProblemThumb と対。2026-08-08 オーナー指摘で追加）。

import type { Problem } from "@rigel/schema";
import { problemHandTiles } from "@rigel/ui";
import { StyleSheet, View } from "react-native";
import { MiniTile, TILE_ASPECT } from "./MiniTile";

export function ProblemHandPreview({ problem, tileW = 19 }: { problem: Problem; tileW?: number }) {
  const tileH = Math.round(tileW * TILE_ASPECT);
  return (
    <View style={styles.row}>
      {problemHandTiles(problem).map((t, i) => (
        <MiniTile key={`${t}-${i}`} code={t} w={tileW} h={tileH} />
      ))}
      {problem.kind === "discard" && problem.drawn ? (
        // ツモ牌は少し離して「14枚目」を示す（回答画面の手牌行と同じ見せ方）。
        <View style={styles.drawn}>
          <MiniTile code={problem.drawn} w={tileW} h={tileH} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 1, alignItems: "center" },
  drawn: { marginLeft: 5 },
});
