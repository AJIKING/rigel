import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  createQuizRng,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  tileLabel,
  QUIZ_FREE_NOTE,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_SESSION_SECONDS,
  type ChinitsuQuestion,
  type EfficiencyQuestion,
  type QuizAnswerRecord,
} from "@rigel/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { MiniTile } from "../components/MiniTile";
import { trackEvent } from "../lib/analytics";
import { finishQuizSession, startQuizSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

const KINDS: readonly QuizKind[] = ["chinitsu", "efficiency"];

type Question = ChinitsuQuestion | EfficiencyQuestion;
type Phase = "select" | "running" | "result";

/** 回答後に○×（正誤のみ・正答は見せない）を表示してから次問へ進むまでの時間（ミリ秒）。 */
const FEEDBACK_MS = 500;

/**
 * 特訓画面（特訓タブ）。60秒タイムアタックで清一色多面待ち・牌効率を反復する。
 * web の TrainingScreen と同一挙動（出題・採点は @rigel/ui の決定的アルゴリズム、
 * 回数制限は開始 API がサーバ強制。Plan: docs/plans/quiz-training.md）。
 * seed はテストで出題列を固定するための注入口（未指定は Date.now()）。
 * onOpenSettings は無料枠使い切り（402）時のアップグレード導線
 * （プラン変更 UI のある設定タブへ。HomeTabs が配線）。
 */
export function TrainingScreen({
  seed,
  onOpenSettings,
}: {
  seed?: number;
  onOpenSettings?: () => void;
}) {
  const { user, token } = useAuth();

  const [phase, setPhase] = useState<Phase>("select");
  const [kind, setKind] = useState<QuizKind>("chinitsu");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** free の本日の残り回数（開始応答ベース。有料は null=無制限で表示しない）。 */
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [total, setTotal] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(QUIZ_SESSION_SECONDS);
  const [starting, setStarting] = useState(false);
  /** 清一色: 選択中の待ち牌（回答前）。 */
  const [picked, setPicked] = useState<readonly Tile[]>([]);
  /** 回答直後の正誤表示（0.5秒だけ出して次問へ）。null=回答受付中。 */
  const [feedback, setFeedback] = useState<"ok" | "ng" | null>(null);
  /** 見直しリスト（回答済みの問題のみ。セッション内だけで保持しサーバへは送らない）。 */
  const [records, setRecords] = useState<readonly QuizAnswerRecord[]>([]);
  /** 結果送信の失敗（結果画面は出したままエラーを小さく表示）。 */
  const [sendError, setSendError] = useState(false);

  const sessionIdRef = useRef<string | null>(null);
  const rngRef = useRef<(() => number) | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nextQuestion = useCallback((k: QuizKind) => {
    const rng = rngRef.current;
    if (!rng) return;
    setQuestion(k === "chinitsu" ? generateChinitsuQuestion(rng) : generateEfficiencyQuestion(rng));
    setPicked([]);
    setFeedback(null);
  }, []);

  // アンマウント時に正解表示タイマーを残さない。
  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  /** 採点して○×だけを0.5秒表示し、次問へ進む（誤答もスキップ扱いで次問へ）。
   *  回答は見直しリストに記録する（正答の確認は結果画面で行う）。 */
  function grade(ok: boolean, myAnswer: readonly Tile[]) {
    setTotal((t) => t + 1);
    if (ok) setCorrect((c) => c + 1);
    if (question) setRecords((rs) => [...rs, { question, picked: [...myAnswer], ok }]);
    setFeedback(ok ? "ok" : "ng");
    feedbackTimerRef.current = setTimeout(() => nextQuestion(kind), FEEDBACK_MS);
  }

  /** 清一色: 待ち牌候補のトグル選択。 */
  function toggleWait(tile: Tile) {
    if (feedback !== null) return;
    setPicked((p) => (p.includes(tile) ? p.filter((x) => x !== tile) : [...p, tile]));
  }

  /** 清一色: 回答（待ち牌の完全一致のみ正解）。 */
  function submitChinitsu() {
    if (!question || question.kind !== "chinitsu" || feedback !== null || picked.length === 0) {
      return;
    }
    const answer = new Set<Tile>(question.answer);
    grade(picked.length === answer.size && picked.every((t) => answer.has(t)), picked);
  }

  /** 牌効率: 牌タップ=その牌を切る（bestDiscards に含まれれば正解）。 */
  function discardTile(tile: Tile) {
    if (!question || question.kind !== "efficiency" || feedback !== null) return;
    grade(question.answer.includes(tile), [tile]);
  }

  // 60秒カウントダウン（セッション中のみ）。
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setSecondsLeft((sec) => Math.max(0, sec - 1)), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // 60秒経過: 回答中の問題は打ち切って結果画面へ。結果はサーバに記録する
  // （送信に失敗してもUIは結果を出す。エラーは小さく表示）。
  useEffect(() => {
    if (phase !== "running" || secondsLeft > 0) return;
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setPhase("result");
    void trackEvent(ANALYTICS_EVENTS.quizComplete, { kind });
    const sessionId = sessionIdRef.current;
    if (!sessionId || !token) return;
    finishQuizSession(token, sessionId, {
      kind,
      total,
      correct,
      durationMs: QUIZ_SESSION_SECONDS * 1000,
    })
      .then((r) => {
        if (!r.ok) setSendError(true);
      })
      .catch(() => setSendError(true));
  }, [phase, secondsLeft, kind, total, correct, token]);

  async function start(k: QuizKind) {
    if (starting || !token) return;
    setStarting(true);
    try {
      const res = await startQuizSession(token, k).catch(() => ({
        ok: false as const,
        status: 0,
      }));
      if (!res.ok) {
        setErrorMsg(
          res.status === 402
            ? QUIZ_LIMIT_MESSAGE
            : "開始できませんでした。少し待って再度お試しください。",
        );
        return;
      }
      setErrorMsg(null);
      setSendError(false);
      sessionIdRef.current = res.id;
      setRemainingToday(res.remainingToday);
      // 出題はシード付きの決定的生成（テストは seed 注入で期待値を固定できる）。
      rngRef.current = createQuizRng(seed ?? Date.now());
      setKind(k);
      setTotal(0);
      setCorrect(0);
      setRecords([]);
      setSecondsLeft(QUIZ_SESSION_SECONDS);
      void trackEvent(ANALYTICS_EVENTS.quizStart, { kind: k });
      nextQuestion(k);
      setPhase("running");
    } finally {
      setStarting(false);
    }
  }

  // アプリはログイン必須（App がゲート）だが、画面単体でも防御的にログイン導線を出す。
  if (!user) return <CenterState message="特訓するにはログインしてください。" />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <Text style={styles.title}>特訓</Text>
      <Text style={styles.subtitle}>60秒でどれだけ解ける？ 反復で読みを速くする</Text>

      {phase === "select" ? (
        <View style={styles.section}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              style={styles.card}
              disabled={starting}
              onPress={() => void start(k)}
              accessibilityRole="button"
            >
              <Text style={styles.cardTitle}>{QUIZ_KIND_LABELS[k]}</Text>
              <Text style={styles.cardDesc}>{QUIZ_KIND_DESCRIPTIONS[k]}</Text>
            </Pressable>
          ))}
          {errorMsg ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMsg}
            </Text>
          ) : null}
          {/* 無料枠の使い切り（402）にはプラン変更 UI（設定タブ）へのアップグレード導線を添える。 */}
          {errorMsg === QUIZ_LIMIT_MESSAGE && onOpenSettings ? (
            <Pressable style={styles.upgrade} onPress={onOpenSettings} accessibilityRole="button">
              <Text style={styles.upgradeText}>プランをアップグレード</Text>
            </Pressable>
          ) : null}
          {user.plan === "free" ? <Text style={styles.note}>{QUIZ_FREE_NOTE}</Text> : null}
        </View>
      ) : phase === "result" ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultHead}>結果</Text>
          <Text style={styles.resultLine}>{QUIZ_KIND_LABELS[kind]}</Text>
          <Text style={styles.resultLine}>
            正解 {correct} / {total}問
          </Text>
          <Text style={styles.resultLine}>
            正答率 {total > 0 ? Math.round((correct / total) * 100) : 0}%
          </Text>
          {/* セッションは60秒固定なので出題数=1分あたりの回答ペース。 */}
          <Text style={styles.resultLine}>1分あたり{total}問</Text>
          {/* 見直しリスト: 回答した問題だけを○×・手牌・あなたの回答・正解つきで振り返る
              （セッション中は正答を見せないぶんここで確認する。サーバには送らない）。 */}
          {records.length > 0 ? (
            <View style={styles.review}>
              <Text style={styles.reviewHead}>見直し</Text>
              {records.map((r, i) => (
                <View key={i} style={styles.reviewRow} testID={`review-row-${i + 1}`}>
                  <Text style={styles.reviewNo}>
                    {i + 1}{" "}
                    <Text style={[styles.reviewMark, r.ok ? styles.ok : styles.ng]}>
                      {r.ok ? "○" : "×"}
                    </Text>
                  </Text>
                  <View style={styles.reviewTiles} testID={`review-hand-${i + 1}`}>
                    {r.question.tiles.map((t, j) => (
                      <MiniTile key={j} code={t} w={18} h={25} />
                    ))}
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
                      {r.question.answer.map((t, j) => (
                        <MiniTile key={j} code={t} w={18} h={25} />
                      ))}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
          {remainingToday !== null ? (
            <Text style={styles.note}>今日あと{remainingToday}回</Text>
          ) : null}
          {sendError ? <Text style={styles.sendError}>結果の送信に失敗しました。</Text> : null}
          <Pressable
            style={styles.retry}
            onPress={() => setPhase("select")}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>もう一度</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.hud}>
            <Text style={styles.hudKind}>{QUIZ_KIND_LABELS[kind]}</Text>
            <Text style={styles.hudScore}>
              正解 {correct} / {total}問
            </Text>
            <Text style={styles.hudTime}>残り {secondsLeft}秒</Text>
            {remainingToday !== null ? (
              <Text style={styles.hudRemain}>今日あと{remainingToday}回</Text>
            ) : null}
          </View>
          {question ? (
            <QuestionPanel
              question={question}
              picked={picked}
              feedback={feedback}
              onToggleWait={toggleWait}
              onSubmitChinitsu={submitChinitsu}
              onDiscard={discardTile}
            />
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

/** 出題エリア（清一色=待ち牌の複数選択 / 牌効率=切る牌のタップ）。 */
function QuestionPanel({
  question,
  picked,
  feedback,
  onToggleWait,
  onSubmitChinitsu,
  onDiscard,
}: {
  question: Question;
  picked: readonly Tile[];
  feedback: "ok" | "ng" | null;
  onToggleWait: (tile: Tile) => void;
  onSubmitChinitsu: () => void;
  onDiscard: (tile: Tile) => void;
}) {
  const grading = feedback !== null;
  const feedbackEl = grading ? (
    <Text style={[styles.feedback, feedback === "ok" ? styles.ok : styles.ng]}>
      {feedback === "ok" ? "正解！" : "不正解…"}
    </Text>
  ) : null;

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9。回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const suit = question.tiles[0]![1]!;
    const candidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as Tile);
    return (
      <View style={styles.panel}>
        <Text style={styles.question}>待ち牌を全部選んで「回答」（完全一致で正解）</Text>
        <View style={styles.hand}>
          {question.tiles.map((t, i) => (
            <MiniTile key={i} code={t} w={24} h={34} />
          ))}
        </View>
        <View style={styles.candidates}>
          {candidates.map((t) => {
            const on = picked.includes(t);
            return (
              <Pressable
                key={t}
                style={on ? styles.sel : null}
                disabled={grading}
                onPress={() => onToggleWait(t)}
                accessibilityRole="button"
                accessibilityLabel={tileLabel(t)}
                accessibilityState={{ selected: on }}
              >
                <MiniTile code={t} w={30} h={42} />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.submitRow}>
          <Pressable
            style={[styles.submit, (grading || picked.length === 0) && styles.submitOff]}
            disabled={grading || picked.length === 0}
            onPress={onSubmitChinitsu}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>回答</Text>
          </Pressable>
          {feedbackEl}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.question}>受け入れが最大になる牌をタップして切る</Text>
      <View style={styles.hand}>
        {question.tiles.map((t, i) => (
          <Pressable
            key={i}
            disabled={grading}
            onPress={() => onDiscard(t)}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(t)}
          >
            <MiniTile code={t} w={30} h={42} />
          </Pressable>
        ))}
      </View>
      <View style={styles.submitRow}>{feedbackEl}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  subtitle: { color: colors.w45, fontSize: 12 },
  section: { gap: 10 },
  card: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 6,
  },
  cardTitle: { color: colors.white, fontSize: 15, fontWeight: "800" },
  cardDesc: { color: colors.w45, fontSize: 12, lineHeight: 18 },
  error: { color: colors.vermilion, fontSize: 13 },
  upgrade: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  upgradeText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  note: { color: colors.w45, fontSize: 12 },
  hud: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10 },
  hudKind: { color: colors.w70, fontSize: 12, fontWeight: "700" },
  hudScore: { color: colors.white, fontSize: 13, fontWeight: "800" },
  hudTime: { color: colors.accent, fontSize: 13, fontWeight: "800" },
  hudRemain: { color: colors.w45, fontSize: 12 },
  panel: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
    gap: 10,
  },
  question: { color: colors.w70, fontSize: 12.5 },
  hand: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 3 },
  candidates: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  sel: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 5,
    margin: -2,
  },
  submitRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 40 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 26,
    alignItems: "center",
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  feedback: { fontSize: 14, fontWeight: "800" },
  ok: { color: colors.emLite },
  ng: { color: colors.vermilion },
  resultBox: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
  },
  resultHead: { color: colors.w45, fontSize: 12, fontWeight: "800" },
  resultLine: { color: colors.white, fontSize: 14, fontWeight: "700" },
  // 見直しリスト（結果画面のみ）
  review: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    gap: 12,
  },
  reviewHead: { color: colors.w45, fontSize: 12, fontWeight: "800" },
  reviewRow: {
    gap: 6,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  reviewNo: { color: colors.w70, fontSize: 13, fontWeight: "800" },
  reviewMark: { fontSize: 14, fontWeight: "800" },
  reviewTiles: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  reviewLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  reviewLabel: { color: colors.w45, fontSize: 11 },
  sendError: { color: colors.vermilion, fontSize: 12 },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  retryText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
});
