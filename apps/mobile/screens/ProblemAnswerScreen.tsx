import { useRoute, type RouteProp } from "@react-navigation/native";
import { problemTargetTile, type CallType, type ProblemAction, type Tile } from "@rigel/schema";
import {
  actionLabel,
  answerNeedsTile,
  buildProblemAnswer,
  canRiichiAfterDiscard,
  canSubmitProblemAnswer,
  chiRunLabel,
  choiceKeyLabel,
  isFlatProblem,
  problemChiVariants,
  problemRoundLabel,
  problemToKifu,
  seatLabel,
  sortHandTiles,
  statsRatios,
  tileLabel,
  togglePickedTile,
  windOf,
  CALL_CHOICES,
  type PickedTile,
} from "@rigel/ui";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { BoardTable } from "../components/BoardTable";
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
 * 何切る問題の回答画面。正解は設けない（多様な正解を前提に、回答後に
 * 出題者のコメントとみんなの回答分布を見る）。回答するまでコメント・分布は見せない。
 * 集計（回答の保存と分布）はログイン時のみ（未ログインは回答体験＋コメントまで）。
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
  // ゲストがサインインへ戻るための導線（回答はサインイン必須）。
  const { endGuest } = useAuth();
  const problem = post.problem;
  const pov = problem.pov;
  const hand = useMemo(() => sortHandTiles(problem.seats[pov].hand), [problem, pov]);
  const targetTile = problemTargetTile(problem);
  const dealer = problem.meta.dealer;
  const { width } = useWindowDimensions();

  // 平面何切る（場況なし）は麻雀卓を描かず、手牌中心のフラット表示にする
  // （[決定] 2026-08-08 オーナー。判定は @rigel/ui の isFlatProblem＝web と共有）。
  const flat = isFlatProblem(problem);
  const povMelds = problem.seats[pov].melds;

  // 盤面は牌譜と同じ回転卓（BoardTable）で描く。河は全表示（既定）・鳴き判断は対象牌を強調（web と同じ方針）。
  const boardKifu = useMemo(() => problemToKifu(problem), [problem]);
  const highlightRiver =
    problem.kind === "call" && problem.targetSeat
      ? { seat: problem.targetSeat, index: problem.seats[problem.targetSeat].river.length - 1 }
      : null;
  // 場風+巡目（共有関数）。本場・供託・ドラは BoardTable が meta から表示する。
  const roundLabel = problemRoundLabel(problem.meta);
  // 卓サイズは KifuEditor のプレビューと同じ算出（画面幅に合わせて clamp）。
  const boardSize = Math.max(240, Math.min(width - 28, 340));

  // 選択は「どの牌を・どこから（手牌の何枚目 or ツモ牌）」で持つ。牌コードでなく
  // 位置（index。ツモ牌は -1）で区別するので、同じ牌が手牌に2枚あっても選択枠は
  // タップした1枚だけに付き、ツモ牌タップ＝ツモ切りとして集計される。
  const [picked, setPicked] = useState<PickedTile | null>(null);
  const [riichi, setRiichi] = useState(false);
  const [call, setCall] = useState<"pass" | CallType | null>(null);
  // チーの構成（567/678/789 など）。候補は対象牌×手牌から導出し、既定は最初の候補。
  const chiChoices = useMemo(() => problemChiVariants(problem), [problem]);
  const [chiRun, setChiRun] = useState<Tile[] | null>(null);
  const effChiRun = chiRun ?? chiChoices[0] ?? null;
  const [answered, setAnswered] = useState<ProblemAction | null>(null);
  const [stats, setStats] = useState<ProblemStats | null>(null);

  // 回答済みならサーバの自分の回答（stats.myAction）で復元する（開き直しを再回答に見せない。
  // 保存は1人1行 upsert なので再回答自体は「やり直す」から可能）。
  useEffect(() => {
    if (!token) return;
    let active = true;
    getProblemStats(token, post.id)
      .catch(() => null)
      .then((s) => {
        if (!active || !s?.myAction) return;
        const mine = s.myAction;
        // ローカルで回答済み（復元より先に回答した）場合は上書きしない。
        setAnswered((prev) => prev ?? mine);
        setStats((prev) => prev ?? s);
      });
    return () => {
      active = false;
    };
  }, [token, post.id]);

  // リーチは「選択中の牌を切ってテンパイが維持される（門前）」ときだけ宣言できる。
  const riichiOk = canRiichiAfterDiscard(problem, picked);

  // 選択状態→アクションの組み立ては共有純関数（web と同一挙動）。
  // riichi はここで riichiOk と掛けて、無効なリーチ宣言が送信に混ざる余地を構造的に断つ
  //（Chip の disabled / pickTile の解除は表示の整合のため）。
  const sel = {
    kind: problem.kind,
    tile: picked?.tile ?? null,
    riichi: riichi && riichiOk,
    tsumogiri: problem.kind === "discard" && (picked?.drawn ?? false),
    call,
    chiTiles: call === "chi" ? effChiRun : null,
  };
  const needsTile = answerNeedsTile(sel);
  const pending = buildProblemAnswer(sel);
  const canSubmit = canSubmitProblemAnswer(sel);

  async function submit() {
    // 回答はサインイン必須（[決定] 2026-07-29: 回答ログを残せない体験は提供しない）。
    if (!token) return;
    const action = buildProblemAnswer(sel);
    if (!action) return;
    setAnswered(action);
    const res = await answerProblem(token, post.id, action).catch(() => ({
      ok: false,
      status: 0,
    }));
    if (res.ok) setStats(await getProblemStats(token, post.id).catch(() => null));
  }

  /** 回答のやり直し（再回答はサーバ側 upsert で上書きされる）。選択は保持する。 */
  function redo() {
    setAnswered(null);
    setStats(null);
  }

  function pickTile(tile: Tile, drawn: boolean, index: number) {
    if (answered || !needsTile) return;
    const next = togglePickedTile(picked, tile, drawn, index);
    setPicked(next);
    // リーチできない選択に変わったら宣言表示も下ろす（送信の正しさは sel 側で担保済み）。
    if (!canRiichiAfterDiscard(problem, next)) setRiichi(false);
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

      {/* 質問見出し。正解は無い＝「あなたなら」を問う（web と同一文言）。 */}
      <Text style={styles.question}>
        {problem.kind === "discard"
          ? "あなたなら何を切る？"
          : problem.targetSeat && targetTile
            ? `${seatLabel(problem.targetSeat)}家が切った ${tileLabel(targetTile)}、あなたならどうする？`
            : ""}
      </Text>

      {/* 場況ありは牌譜と同じ回転卓（BoardTable）。ドラ・本場・供託は卓中央・点数はネームプレート。
          平面何切るは卓を描かず、ドラ表示牌だけを行で見せる（フラット表示）。 */}
      {flat ? (
        problem.meta.dora.length > 0 ? (
          <>
            <Text style={styles.section}>ドラ表示牌</Text>
            <View style={styles.doraRow}>
              {problem.meta.dora.map((t, i) => (
                <MiniTile key={`${t}-${i}`} code={t} w={24} h={34} />
              ))}
            </View>
          </>
        ) : null
      ) : (
        <View style={styles.boardWrap}>
          <BoardTable
            kifu={boardKifu}
            bottomSeat={pov}
            dealer={dealer ?? pov}
            roundLabel={roundLabel}
            showHands={false}
            size={boardSize}
            points={problem.scores}
            highlightRiver={highlightRiver}
          />
        </View>
      )}

      {/* 自分の手牌（理牌済み）＋ツモ牌 */}
      <Text style={styles.section}>手牌</Text>
      <View style={styles.hand}>
        {hand.map((t, i) => {
          const on = picked !== null && !picked.drawn && picked.index === i;
          return t.tile ? (
            <Pressable
              key={i}
              style={on ? styles.sel : null}
              disabled={answered !== null || !needsTile}
              onPress={() => pickTile(t.tile!, false, i)}
              accessibilityRole="button"
              accessibilityLabel={tileLabel(t.tile)}
              accessibilityState={{ selected: on }}
            >
              <MiniTile code={t.tile} w={30} h={42} />
            </Pressable>
          ) : null;
        })}
        {problem.drawn ? (
          <Pressable
            style={[styles.drawn, picked?.drawn ? styles.sel : null]}
            disabled={answered !== null}
            onPress={() => pickTile(problem.drawn!, true, -1)}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(problem.drawn)}
            accessibilityState={{ selected: picked?.drawn === true }}
          >
            <MiniTile code={problem.drawn} w={30} h={42} />
          </Pressable>
        ) : null}
        {/* 平面表示では卓が無いので、自席の副露も手牌の並びに添える。 */}
        {flat
          ? povMelds.map((m, mi) => (
              <View key={mi} style={styles.flatMeld}>
                {m.tiles.map((t, ti) =>
                  t.tile ? <MiniTile key={ti} code={t.tile} w={24} h={34} /> : null,
                )}
              </View>
            ))
          : null}
      </View>
      {/* ツモ牌は手牌の右に離して置く。初見でも分かるよう言葉でも添える（web と同一文言）。 */}
      {problem.drawn ? (
        <Text style={styles.drawnNote}>右端はツモ牌（タップするとツモ切りになります）</Text>
      ) : null}

      {/* 回答 UI */}
      {!answered ? (
        <View style={styles.answerBox}>
          {problem.kind === "discard" ? (
            <>
              <Text style={styles.hint}>切る牌をタップしてください。</Text>
              <View style={styles.chipRow}>
                <Chip
                  label="リーチ"
                  on={riichi}
                  disabled={!riichiOk}
                  onPress={() => setRiichi((v) => !v)}
                />
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
                      if (key === "pass" || key === "kan") setPicked(null);
                    }}
                  />
                ))}
              </View>
              {/* チーの構成（例 345筒/456筒/567筒）。候補が1つでも明示して誤解を防ぐ。 */}
              {call === "chi" && chiChoices.length > 0 ? (
                <View style={styles.chipRow}>
                  {chiChoices.map((run) => (
                    <Chip
                      key={run.join(",")}
                      label={chiRunLabel(run)}
                      on={effChiRun?.join(",") === run.join(",")}
                      onPress={() => setChiRun(run)}
                    />
                  ))}
                </View>
              ) : null}
              {call === "pon" || call === "chi" ? (
                <Text style={styles.hint}>鳴いた後に切る牌を手牌からタップしてください。</Text>
              ) : null}
            </>
          )}
          {/* 選択中の手を言葉でも確認できるようにする（押し間違い防止。web と同一文言）。 */}
          {pending ? <Text style={styles.pending}>選択中: {actionLabel(pending)}</Text> : null}
          <Pressable
            style={[styles.submit, (!canSubmit || !token) && styles.submitOff]}
            disabled={!canSubmit || !token}
            onPress={() => void submit()}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>回答する</Text>
          </Pressable>
          {/* 未サインインは回答不可（回答ログを残せないため）。ログイン画面へ戻す導線を出す。 */}
          {!token ? (
            <Pressable onPress={() => endGuest()} accessibilityRole="button" hitSlop={6}>
              <Text style={styles.loginCta}>回答にはサインインが必要です — サインインする</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.resultBox}>
          <View style={styles.myAnswerRow}>
            <Text style={styles.myAnswer}>あなたの回答: {actionLabel(answered)}</Text>
            <Pressable style={styles.redoBtn} onPress={redo} accessibilityRole="button">
              <Text style={styles.redoText}>回答をやり直す</Text>
            </Pressable>
          </View>
          {/* 正解は設けない（多様な正解を前提）。出題者のコメントとみんなの分布を見る。 */}
          {problem.explanation ? (
            <>
              <Text style={styles.resultHead}>出題者のコメント</Text>
              <Text style={styles.explanation}>{problem.explanation}</Text>
            </>
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
                      {/* 自分の回答のバーはアクセント色で強調（web の statBarMine と同じ意図）。 */}
                      <View
                        testID={`stat-bar-${key}`}
                        style={[
                          styles.statBar,
                          stats.myChoiceKey === key && styles.statBarMine,
                          { width: `${ratio}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.statPct}>{ratio}%</Text>
                    <Text style={styles.statCount}>{count}件</Text>
                  </View>
                ))}
              </>
            ) : null
          ) : (
            <Text style={styles.loginCta}>サインインすると回答分布が見られます</Text>
          )}
        </View>
      )}
    </ScrollView>
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
  boardWrap: { alignItems: "center", marginTop: 2 },
  /* 平面何切る（フラット表示）: ドラ表示牌の行と、自席の副露（手牌の右に離す）。 */
  doraRow: { flexDirection: "row", gap: 2 },
  flatMeld: { flexDirection: "row", gap: 2, marginLeft: 12 },
  question: { color: colors.white, fontSize: 16, fontWeight: "800", marginTop: 2 },
  section: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
  hand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  drawn: { marginLeft: 10 },
  drawnNote: { color: colors.w45, fontSize: 11, marginTop: -4 },
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
  pending: { color: colors.white, fontSize: 13, fontWeight: "700" },
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
  myAnswerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myAnswer: { color: colors.w70, fontSize: 13, flexShrink: 1 },
  // 回答後はこのボタンだけが次の操作。無効ボタンに見えないよう明るい線・文字＋薄い面にする（web と同調）。
  redoBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  redoText: { color: colors.white, fontSize: 12 },
  resultHead: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
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
  // 既定のバーは卓の緑系（web の --accent と同じ意図）。自分の回答だけオレンジで目立たせる。
  statBar: { height: "100%", backgroundColor: colors.emLite },
  statBarMine: { backgroundColor: colors.accent },
  statPct: { color: colors.w70, fontSize: 12, width: 38, textAlign: "right" },
  statCount: { color: colors.w45, fontSize: 11, width: 34, textAlign: "right" },
  loginCta: { color: colors.accent, fontSize: 12.5, marginTop: 4 },
});
