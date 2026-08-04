import type { Tile } from "@rigel/schema";
import {
  chinitsuUkeireCandidates,
  scoreDisplayTiles,
  scoreMeldViews,
  scoreYakuLine,
  ukeireLabel,
  ukeireReviewModel,
  type QuizAnswerRecord,
} from "@rigel/ui";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../lib/theme";
import { MiniTile } from "./MiniTile";

/**
 * 見直しリスト（回答した問題ごとに ○×・牌姿・あなたの回答・正解・受け入れ詳細）。
 * 特訓の結果画面と、マイページのセッション詳細（有料の保存レコード）で共有する
 * （web の components/training/QuizReviewList と同構造）。
 */
export function QuizReviewList({ records }: { records: readonly QuizAnswerRecord[] }) {
  if (records.length === 0) return null;
  return (
    <View style={styles.review}>
      {/* 見出しテキストは置かずリストを直接置く（[決定] 2026-07-25 オーナーレビュー）。 */}
      {records.map((r, i) => {
        const q = r.question;
        return (
          <View
            key={i}
            style={[styles.reviewRow, r.ok ? styles.rowOk : styles.rowNg]}
            testID={`review-row-${i + 1}`}
          >
            {/* 1行目=番号＋○×のヘッダ。問題は回答・正解と同じ「ラベル＋牌列」の行にする。 */}
            <Text style={styles.reviewNo}>
              {i + 1}{" "}
              <Text style={[styles.reviewMark, r.ok ? styles.ok : styles.ng]}>
                {r.ok ? "○" : "×"}
              </Text>
            </Text>
            {q.kind === "score" ? (
              // 点数計算: 条件＋ドラ表示牌＋牌姿（手牌+副露+和了牌）に、回答/正解の
              // テキスト行と役の内訳（＝見直しで数え方まで学べる）。
              <>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>問題</Text>
                  <Text style={styles.reviewText}>{q.label}</Text>
                </View>
                <View style={styles.reviewLine} testID={`review-dora-${i + 1}`}>
                  <Text style={styles.reviewLabel}>ドラ表示牌</Text>
                  <View style={styles.reviewTiles}>
                    {q.doraIndicators.map((t, j) => (
                      <MiniTile key={j} code={t} w={18} h={25} />
                    ))}
                  </View>
                </View>
                <View
                  style={[styles.reviewTiles, styles.reviewLineTiles]}
                  testID={`review-hand-${i + 1}`}
                >
                  {scoreDisplayTiles(q).map((t, j) => (
                    <MiniTile key={j} code={t} w={18} h={25} />
                  ))}
                  {q.melds.map((m, mi) => (
                    <View key={`m${mi}`} style={styles.reviewMeld}>
                      {scoreMeldViews(m, q.seatWind).map((v, j) =>
                        v.back ? (
                          <View key={j} style={styles.reviewBack} />
                        ) : (
                          <View key={j} style={v.lay ? styles.lay : null}>
                            <MiniTile code={v.tile} w={18} h={25} />
                          </View>
                        ),
                      )}
                    </View>
                  ))}
                  <View style={styles.winTile}>
                    <MiniTile code={q.winTile} w={18} h={25} />
                  </View>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>あなたの回答</Text>
                  <Text style={styles.reviewText}>{r.pickedChoice}</Text>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>正解</Text>
                  <Text style={styles.reviewText}>{q.answer}</Text>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>役</Text>
                  <Text style={styles.reviewText}>{scoreYakuLine(q)}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>問題</Text>
                  <View
                    style={[styles.reviewTiles, styles.reviewLineTiles]}
                    testID={`review-hand-${i + 1}`}
                  >
                    {q.tiles.map((t, j) => (
                      <MiniTile key={j} code={t} w={18} h={25} />
                    ))}
                  </View>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>あなたの回答</Text>
                  <View style={styles.reviewTiles} testID={`review-picked-${i + 1}`}>
                    {r.picked.map((t, j) => (
                      <MiniTile key={j} code={t} w={18} h={25} />
                    ))}
                  </View>
                </View>
                <View style={styles.reviewLine}>
                  <Text style={styles.reviewLabel}>正解</Text>
                  <View style={styles.reviewTiles} testID={`review-answer-${i + 1}`}>
                    {q.answer.map((t, j) => (
                      <MiniTile key={j} code={t} w={18} h={25} />
                    ))}
                  </View>
                </View>
                {q.kind === "efficiency" || q.kind === "chinitsuUkeire" ? (
                  <UkeireDetail
                    no={i + 1}
                    tiles={q.tiles}
                    picked={r.picked[0] ?? null}
                    candidates={
                      q.kind === "chinitsuUkeire" ? chinitsuUkeireCandidates(q.suit) : undefined
                    }
                  />
                ) : null}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 牌効率の見直し行に出す受け入れ詳細（web の UkeireDetail と同一挙動）。
 * 計算は共有ヘッドレスモデル（@rigel/ui の ukeireReviewModel）に一元化し、
 * 表示時に行う（60秒セッション中の負荷を増やさない）。計算は重い
 * （14枚×34種の向聴総当たり）ので useMemo で手牌が変わらない再レンダーでは再計算しない。
 */
function UkeireDetail({
  no,
  tiles,
  picked,
  candidates,
}: {
  no: number;
  tiles: readonly Tile[];
  picked: Tile | null;
  /** 受け入れとして数える牌種。出題時と同じものを渡す（清一色 牌効率は同色9種）。 */
  candidates?: readonly Tile[];
}) {
  const model = useMemo(
    () => ukeireReviewModel(tiles, picked, candidates),
    [tiles, picked, candidates],
  );
  const { mine, regressed, best } = model;
  return (
    <View style={styles.ukeireDetail}>
      {mine ? (
        <View style={styles.ukeireLine} testID={`review-ukeire-mine-${no}`}>
          {regressed ? <Text style={styles.regress}>向聴戻し</Text> : null}
          <Text style={styles.ukeireCount}>
            {ukeireLabel(mine.shanten)} {mine.tiles.length}種{mine.count}枚
          </Text>
          <View style={styles.reviewTiles}>
            {mine.tiles.map((t, j) => (
              <MiniTile key={j} code={t} w={18} h={25} />
            ))}
          </View>
        </View>
      ) : null}
      {best.map((u) => (
        <View key={u.discard} style={styles.ukeireLine}>
          <MiniTile code={u.discard} w={18} h={25} />
          <Text style={styles.ukeireArrow}>→</Text>
          <View style={styles.ukeireBody} testID={`review-ukeire-best-${no}-${u.discard}`}>
            <Text style={styles.ukeireCount}>
              {ukeireLabel(u.shanten)} {u.tiles.length}種{u.count}枚
            </Text>
            <View style={styles.reviewTiles}>
              {u.tiles.map((t, j) => (
                <MiniTile key={j} code={t} w={18} h={25} />
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// スタイルは特訓画面（TrainingScreen）の見直しリストから移設（値は同一）。
const styles = StyleSheet.create({
  review: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 10,
  },
  // 行はカード化し、左端に○×の色帯（緑/赤）を敷く
  reviewRow: {
    gap: 6,
    backgroundColor: colors.chrome2,
    borderRadius: radius.card,
    borderLeftWidth: 3,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
  },
  rowOk: { borderLeftColor: colors.emLite },
  rowNg: { borderLeftColor: "#d10f3a" },
  reviewNo: { color: colors.w70, fontSize: 13, fontWeight: "800" },
  reviewMark: { fontSize: 14, fontWeight: "800" },
  ok: { color: colors.emLite },
  ng: { color: "#ff5f75" },
  reviewTiles: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  reviewLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  // 問題の牌列（13-14枚）はラベルの横で折り返す。
  reviewLineTiles: { flexShrink: 1 },
  reviewLabel: { color: colors.w45, fontSize: 11 },
  reviewText: { color: colors.w70, fontSize: 12.5, fontVariant: ["tabular-nums"] },
  reviewMeld: { flexDirection: "row", gap: 2, marginLeft: 6 },
  reviewBack: {
    width: 18,
    height: 25,
    borderRadius: 3,
    backgroundColor: "#274a37",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  // 鳴いた牌の横向き（位置が鳴き元を示す）
  lay: { transform: [{ rotate: "90deg" }] },
  // 上がり牌: 手牌と分けて強調（アクセント枠）
  winTile: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
    margin: -2,
  },
  // 受け入れ詳細（牌効率のみ。あなたの回答の受け入れ＋正解各打牌の受け入れ）
  ukeireDetail: { gap: 4, marginTop: 2 },
  ukeireLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  ukeireBody: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, flex: 1 },
  ukeireArrow: { color: colors.w45, fontSize: 11 },
  ukeireCount: { color: colors.w70, fontSize: 11, fontVariant: ["tabular-nums"] },
  // 向聴戻しバッジ（要確認カラー #d10f3a 系の赤で警告）
  regress: {
    color: "#ff8fa8",
    backgroundColor: "rgba(209,15,58,0.18)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(209,15,58,0.55)",
    borderRadius: radius.base,
    paddingHorizontal: 6,
    paddingVertical: 1,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
  },
});
