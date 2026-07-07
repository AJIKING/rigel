import { useRoute, type RouteProp } from "@react-navigation/native";
import { problemTargetTile, type CallType, type ProblemAction, type Tile } from "@rigel/schema";
import {
  actionLabel,
  answerNeedsTile,
  buildProblemAnswer,
  canSubmitProblemAnswer,
  choiceKeyLabel,
  seatLabel,
  sortHandTiles,
  statsRatios,
  tileLabel,
  windOf,
  CALL_CHOICES,
  SEAT_ORDER,
} from "@rigel/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { MiniTile } from "../components/MiniTile";
import {
  answerProblem,
  getProblem,
  getProblemStats,
  type ProblemPost,
  type ProblemStats,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { problemShareUrl } from "../lib/problems";
import { colors, radius } from "../lib/theme";

/**
 * 何切る問題の回答画面。回答するまで出題者の答え・解説・分布は見せない。
 * 集計（回答の保存と分布）はログイン時のみ（未ログインは回答体験＋答え・解説まで）。
 */
export function ProblemAnswerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ProblemAnswer">>();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<ProblemPost | null>(null);

  useEffect(() => {
    let active = true;
    getProblem(route.params.problemId, token ?? undefined)
      .catch(() => null)
      .then((p) => {
        if (active) {
          setPost(p);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [route.params.problemId, token]);

  if (loading) return <CenterState loading />;
  if (!post) return <CenterState message="問題が見つかりません。" />;
  return <AnswerBody post={post} token={token} />;
}

function AnswerBody({ post, token }: { post: ProblemPost; token: string | null }) {
  const problem = post.problem;
  const pov = problem.pov;
  const hand = useMemo(() => sortHandTiles(problem.seats[pov].hand), [problem, pov]);
  const targetTile = problemTargetTile(problem);
  const dealer = problem.meta.dealer;

  const [selTile, setSelTile] = useState<Tile | null>(null);
  const [riichi, setRiichi] = useState(false);
  const [call, setCall] = useState<"pass" | CallType | null>(null);
  const [answered, setAnswered] = useState<ProblemAction | null>(null);
  const [stats, setStats] = useState<ProblemStats | null>(null);

  // 選択状態→アクションの組み立ては共有純関数（web と同一挙動）。
  const sel = { kind: problem.kind, tile: selTile, riichi, call };
  const needsTile = answerNeedsTile(sel);
  const canSubmit = canSubmitProblemAnswer(sel);

  async function submit() {
    const action = buildProblemAnswer(sel);
    if (!action) return;
    setAnswered(action);
    // 集計はログイン時のみ（未ログインは分布に数えない＝そもそも呼ばない）。
    if (!token) return;
    const res = await answerProblem(token, post.id, action).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (res.ok) setStats(await getProblemStats(token, post.id).catch(() => null));
  }

  function pickTile(tile: Tile) {
    if (answered || !needsTile) return;
    setSelTile((cur) => (cur === tile ? null : tile));
  }

  /** 公開問題の共有（web 公開ページ /p/:id を OS 共有シートで）。 */
  async function onShare() {
    const url = problemShareUrl(post.id);
    await Share.share({ message: `${post.title || "何切る問題"}\n${url}`, url }).catch(() => {});
  }

  const metaParts = [
    problem.meta.roundWind ? `${seatLabel(problem.meta.roundWind)}場` : null,
    dealer ? `親 ${windOf(dealer, dealer)}家（${seatLabel(dealer)}）` : null,
    `${problem.meta.junme}巡目`,
    problem.meta.honba > 0 ? `${problem.meta.honba}本場` : null,
    problem.meta.kyotaku > 0 ? `供託${problem.meta.kyotaku}本` : null,
  ].filter((p): p is string => p !== null);

  const riversToShow = SEAT_ORDER.filter((seat) => problem.seats[seat].river.length > 0);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{post.title || "（無題の問題）"}</Text>
        {post.status === "draft" ? <Text style={styles.draftBadge}>下書き</Text> : null}
        {post.status === "published" ? (
          <Pressable
            onPress={() => void onShare()}
            accessibilityRole="button"
            accessibilityLabel="共有"
            hitSlop={8}
          >
            <ShareIcon color={colors.w70} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.meta}>{metaParts.join(" ・ ")}</Text>

      {/* ドラ表示 */}
      {problem.meta.dora.length > 0 ? (
        <Row label="ドラ">
          {problem.meta.dora.map((t, i) => (
            <MiniTile key={`${t}-${i}`} code={t} w={26} h={36} />
          ))}
        </Row>
      ) : null}

      {/* 点数状況（手入力の記録のみ） */}
      {problem.scores ? (
        <Row label="点数">
          <Text style={styles.scores}>
            {SEAT_ORDER.map(
              (seat) => `${seatLabel(seat)} ${problem.scores![seat].toLocaleString()}`,
            ).join("　")}
          </Text>
        </Row>
      ) : null}

      {/* 河（作成者が入れた席だけ）。鳴き判断は対象牌を強調。 */}
      {riversToShow.map((seat) => (
        <Row key={seat} label={`${seatLabel(seat)}家の河`}>
          {problem.seats[seat].river.map((d, i) => {
            const isTarget =
              problem.kind === "call" &&
              seat === problem.targetSeat &&
              i === problem.seats[seat].river.length - 1;
            return (
              <View key={i} style={isTarget ? styles.target : null}>
                <MiniTile code={d.tile} w={26} h={36} riichi={d.riichi} />
              </View>
            );
          })}
        </Row>
      ))}
      {problem.kind === "call" && problem.targetSeat && targetTile ? (
        <Text style={styles.question}>
          {seatLabel(problem.targetSeat)}家が切った {tileLabel(targetTile)} を鳴きますか？
        </Text>
      ) : null}

      {/* 自分の手牌（理牌済み）＋ツモ牌 */}
      <Text style={styles.section}>手牌</Text>
      <View style={styles.hand}>
        {hand.map((t, i) =>
          t.tile ? (
            <Pressable
              key={i}
              style={selTile === t.tile ? styles.sel : null}
              disabled={answered !== null || !needsTile}
              onPress={() => pickTile(t.tile!)}
              accessibilityRole="button"
              accessibilityState={{ selected: selTile === t.tile }}
            >
              <MiniTile code={t.tile} w={30} h={42} />
            </Pressable>
          ) : null,
        )}
        {problem.drawn ? (
          <Pressable
            style={[styles.drawn, selTile === problem.drawn ? styles.sel : null]}
            disabled={answered !== null}
            onPress={() => pickTile(problem.drawn!)}
            accessibilityRole="button"
            accessibilityState={{ selected: selTile === problem.drawn }}
          >
            <MiniTile code={problem.drawn} w={30} h={42} />
          </Pressable>
        ) : null}
      </View>

      {/* 回答 UI */}
      {!answered ? (
        <View style={styles.answerBox}>
          {problem.kind === "discard" ? (
            <>
              <Text style={styles.hint}>切る牌をタップしてください。</Text>
              <View style={styles.chipRow}>
                <Chip label="リーチ" on={riichi} onPress={() => setRiichi((v) => !v)} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.chipRow}>
                {CALL_CHOICES.map(({ key, label }) => (
                  <Chip
                    key={key}
                    label={label}
                    on={call === key}
                    onPress={() => {
                      setCall(key);
                      if (key === "pass" || key === "kan") setSelTile(null);
                    }}
                  />
                ))}
              </View>
              {call === "pon" || call === "chi" ? (
                <Text style={styles.hint}>鳴いた後に切る牌を手牌からタップしてください。</Text>
              ) : null}
            </>
          )}
          <Pressable
            style={[styles.submit, !canSubmit && styles.submitOff]}
            disabled={!canSubmit}
            onPress={() => void submit()}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>回答する</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.resultBox}>
          <Text style={styles.myAnswer}>あなたの回答: {actionLabel(answered)}</Text>
          <Text style={styles.resultHead}>出題者の答え</Text>
          <Text style={styles.authorAnswer}>{actionLabel(problem.answer)}</Text>
          {problem.explanation ? (
            <Text style={styles.explanation}>{problem.explanation}</Text>
          ) : null}

          {token ? (
            stats ? (
              <>
                <Text style={styles.resultHead}>回答分布（{stats.total}人）</Text>
                {statsRatios(stats.counts).map(({ key, count, ratio }) => (
                  <View key={key} style={styles.statRow}>
                    <Text style={styles.statLabel}>
                      {choiceKeyLabel(key)}
                      {stats.myChoiceKey === key ? "（あなた）" : ""}
                    </Text>
                    <View style={styles.statBarWrap}>
                      <View style={[styles.statBar, { width: `${ratio}%` }]} />
                    </View>
                    <Text style={styles.statPct}>{ratio}%</Text>
                    <Text style={styles.statCount}>{count}件</Text>
                  </View>
                ))}
              </>
            ) : null
          ) : (
            <Text style={styles.loginCta}>ログインすると回答分布が見られます</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowTiles}>{children}</View>
    </View>
  );
}

function ShareIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 5a3 3 0 100 .01M6 12a3 3 0 100 .01M18 19a3 3 0 100 .01M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  title: { flex: 1, color: colors.white, fontSize: 17, fontWeight: "800" },
  draftBadge: { color: colors.vermilion, fontSize: 12, fontWeight: "700" },
  meta: { color: colors.w45, fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowLabel: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 64 },
  rowTiles: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  scores: { color: colors.w70, fontSize: 12.5 },
  target: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 5,
    padding: 1,
  },
  question: { color: colors.accent, fontSize: 13.5, fontWeight: "700" },
  section: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
  hand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  drawn: { marginLeft: 10 },
  sel: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 5,
    margin: -2,
  },
  answerBox: {
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    marginTop: 6,
  },
  hint: { color: colors.w45, fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    alignItems: "center",
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  resultBox: {
    gap: 8,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    marginTop: 6,
  },
  myAnswer: { color: colors.w70, fontSize: 13 },
  resultHead: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
  authorAnswer: { color: colors.white, fontSize: 15, fontWeight: "800" },
  explanation: { color: colors.w70, fontSize: 13, lineHeight: 20 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statLabel: { color: colors.w70, fontSize: 12, width: 120 },
  statBarWrap: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.chrome2,
    overflow: "hidden",
  },
  statBar: { height: "100%", backgroundColor: colors.accent },
  statPct: { color: colors.w70, fontSize: 12, width: 38, textAlign: "right" },
  statCount: { color: colors.w45, fontSize: 11, width: 34, textAlign: "right" },
  loginCta: { color: colors.accent, fontSize: 12.5, marginTop: 4 },
});
