import type { QuizKind, Tile } from "@rigel/schema";
import {
  ANALYTICS_EVENTS,
  bestUkeires,
  createQuizRng,
  discardUkeires,
  generateChinitsuQuestion,
  generateEfficiencyQuestion,
  tileLabel,
  QUIZ_KIND_DESCRIPTIONS,
  QUIZ_KIND_LABELS,
  QUIZ_KIND_PROMPTS,
  QUIZ_LIMIT_MESSAGE,
  QUIZ_SESSION_SECONDS,
  type ChinitsuQuestion,
  type EfficiencyQuestion,
  type QuizAnswerRecord,
} from "@rigel/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CenterState } from "../components/CenterState";
import { MiniTile } from "../components/MiniTile";
import { trackEvent } from "../lib/analytics";
import { finishQuizSession, startQuizSession } from "../lib/api";
import { useAuth } from "../lib/auth";
import { colors, radius } from "../lib/theme";

const KINDS: readonly QuizKind[] = ["chinitsu", "efficiency"];

/** 種目カードの装飾（牌モチーフ3枚をファン状に。清一色=索子・牌効率=筒子）。装飾なので a11y からは隠す。 */
const CARD_MOTIF: Record<QuizKind, readonly Tile[]> = {
  chinitsu: ["3s", "5s", "7s"],
  efficiency: ["3p", "5p", "7p"],
};

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
  const { user, token, loading } = useAuth();

  const [phase, setPhase] = useState<Phase>("select");
  const [kind, setKind] = useState<QuizKind>("chinitsu");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
    if (starting) return;
    // token 失効（user はいるが token が無い）で沈黙しない。再ログインを促す。
    if (!token) {
      setErrorMsg("ログインが必要です。再度ログインしてください。");
      return;
    }
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
      // 残り回数（res.remainingToday）は表示しない（[決定] 2026-07-25 オーナーレビュー。
      // 上限は 402 時の文言とプランカードで伝える）。
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

  // 認証確認中はログイン導線をフラッシュさせない（文言は web と同じ「読み込み中…」）。
  if (loading) return <CenterState message="読み込み中…" />;
  // アプリはログイン必須（App がゲート）だが、画面単体でも防御的にログイン導線を出す。
  if (!user) return <CenterState message="特訓するにはログインしてください。" />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.body}>
      <Text style={styles.title}>特訓</Text>

      {phase === "select" ? (
        <View style={styles.section}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              disabled={starting}
              onPress={() => void start(k)}
              accessibilityRole="button"
            >
              <View
                style={styles.cardFan}
                importantForAccessibility="no-hide-descendants"
                accessibilityElementsHidden
              >
                {CARD_MOTIF[k].map((t, j) => (
                  <View
                    key={j}
                    style={[styles.fanTile, j === 0 && styles.fanL, j === 2 && styles.fanR]}
                  >
                    <MiniTile code={t} w={30} h={41} />
                  </View>
                ))}
              </View>
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
        </View>
      ) : phase === "result" ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultHead}>結果</Text>
          <Text style={styles.resultLine}>{QUIZ_KIND_LABELS[kind]}</Text>
          {/* スコアは stat カード横並び（正解数・出題数・正答率）。60秒固定なので
              「1分あたり」は出さない（正解/出題と意味が重複するため）。 */}
          <View style={styles.stats}>
            <Text style={styles.stat}>正解 {correct}問</Text>
            <Text style={styles.stat}>出題 {total}問</Text>
            <Text style={styles.stat}>
              正答率 {total > 0 ? Math.round((correct / total) * 100) : 0}%
            </Text>
          </View>
          {/* 見直しリスト: 回答した問題だけを○×・手牌・あなたの回答・正解つきで振り返る
              （セッション中は正答を見せないぶんここで確認する。サーバには送らない）。 */}
          {records.length > 0 ? (
            <View style={styles.review}>
              {/* 見出しテキストは置かずリストを直接置く（[決定] 2026-07-25 オーナーレビュー）。 */}
              {records.map((r, i) => (
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
                  <View style={styles.reviewLine}>
                    <Text style={styles.reviewLabel}>問題</Text>
                    <View
                      style={[styles.reviewTiles, styles.reviewLineTiles]}
                      testID={`review-hand-${i + 1}`}
                    >
                      {r.question.tiles.map((t, j) => (
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
                      {r.question.answer.map((t, j) => (
                        <MiniTile key={j} code={t} w={18} h={25} />
                      ))}
                    </View>
                  </View>
                  {r.question.kind === "efficiency" ? (
                    <UkeireDetail
                      no={i + 1}
                      tiles={r.question.tiles}
                      picked={r.picked[0] ?? null}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
          {sendError ? (
            <Text style={styles.sendError}>
              結果の送信に失敗しました。この挑戦は記録に残りません。
            </Text>
          ) : null}
          {/* 「もう一度挑戦」の再開始が拒否されたとき（402 等）は結果画面の上に表示する。 */}
          {errorMsg ? (
            <Text style={styles.error} accessibilityRole="alert">
              {errorMsg}
            </Text>
          ) : null}
          {errorMsg === QUIZ_LIMIT_MESSAGE && onOpenSettings ? (
            <Pressable style={styles.upgrade} onPress={onOpenSettings} accessibilityRole="button">
              <Text style={styles.upgradeText}>プランをアップグレード</Text>
            </Pressable>
          ) : null}
          {/* 主=同じ種目で即もう1回（開始 API を呼ぶ=1回消費）／副=種目選択へ戻る。 */}
          <View style={styles.resultActions}>
            <Pressable
              style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
              disabled={starting}
              onPress={() => void start(kind)}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>もう一度挑戦</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
              onPress={() => {
                // 「もう一度挑戦」失敗（402等）のエラーを選択画面へ持ち越さない
                //（上限はプランカードで伝える方針）。
                setErrorMsg(null);
                setPhase("select");
              }}
              accessibilityRole="button"
            >
              <Text style={styles.backText}>問題選択にもどる</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.hud}>
            <Text style={styles.hudKind}>{QUIZ_KIND_LABELS[kind]}</Text>
            <Text style={styles.hudScore}>
              正解 {correct} / {total}問
            </Text>
            {/* 残り秒が主役。残り10秒未満は赤系（#d10f3a 系）に変えて焦りを可視化する。 */}
            <Text style={[styles.hudTime, secondsLeft < 10 && styles.hudTimeLow]}>
              残り {secondsLeft}秒
            </Text>
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
          {/* フィードバック帯: 出題パネル直下の固定高さスロット（web と同構造。中央オーバーレイは
              廃止 [決定] 2026-07-25 オーナーレビュー）。回答受付中は透明のまま高さを確保し
              （レイアウトシフトなし・牌やボタンに被せない）、回答直後だけ 正解=緑系（emLite 系）/
              不正解=赤系（#d10f3a 系）に塗って最短文言を出し、0.5秒後に次問と同時に空へ戻る。 */}
          <View
            style={[
              styles.feedbackBand,
              feedback === "ok" && styles.bandOk,
              feedback === "ng" && styles.bandNg,
            ]}
            testID="feedback-band"
            // Android のスクリーンリーダーに○×の差し込みを自動で読ませる（web の role="status" 相当。
            // iOS の announceForAccessibility は今回はスコープ外）。
            accessibilityLiveRegion="polite"
          >
            {feedback !== null ? (
              <Text style={[styles.bandText, feedback === "ok" ? styles.ok : styles.ng]}>
                {feedback === "ok" ? "○ 正解" : "× 不正解"}
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

/**
 * 牌効率の見直し行に出す受け入れ詳細（web の UkeireDetail と同一挙動）。
 * 結果画面の描画時に discardUkeires を計算する（60秒セッション中の負荷を増やさない）。
 * 計算は重い（14枚×34種の向聴総当たり）ので useMemo で手牌が変わらない再レンダーでは
 * 再計算しない。あなたの回答が最小向聴を保っていなければ「向聴戻し」バッジを添え、
 * 正解（bestUkeires=EfficiencyQuestion.answer と同じ集合・同じ順序）は各打牌の受け入れを
 * 1行ずつ並べる。
 */
function UkeireDetail({
  no,
  tiles,
  picked,
}: {
  no: number;
  tiles: readonly Tile[];
  picked: Tile | null;
}) {
  const ukeires = useMemo(() => discardUkeires(tiles), [tiles]);
  const minShanten = ukeires[0]?.shanten;
  const mine = ukeires.find((u) => u.discard === picked);
  // 正解集合の判定は @rigel/ui の bestUkeires に一元化（ここで再実装しない）。
  const best = bestUkeires(ukeires);
  return (
    <View style={styles.ukeireDetail}>
      {mine ? (
        <View style={styles.ukeireLine} testID={`review-ukeire-mine-${no}`}>
          {mine.shanten !== minShanten ? <Text style={styles.regress}>向聴戻し</Text> : null}
          <Text style={styles.ukeireCount}>
            受け入れ {mine.tiles.length}種{mine.count}枚
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
              受け入れ {u.tiles.length}種{u.count}枚
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
  // 回答直後（採点表示中）は操作を無効化する。正誤の表示自体はパネル直下の
  // フィードバック帯（TrainingScreen 側）が担い、ここでは牌・ボタンに何も被せない。
  const grading = feedback !== null;

  if (question.kind === "chinitsu") {
    // 候補は出題スート（単色）の1〜9。回答後も正答は見せない（○×のみ。見直しは結果画面）。
    const suit = question.tiles[0]![1]!;
    const candidates = Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}` as Tile);
    return (
      <View style={styles.panel}>
        <Text style={styles.question}>{QUIZ_KIND_PROMPTS.chinitsu}</Text>
        {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
        <View style={styles.hand}>
          {question.tiles.map((t, i) => (
            <MiniTile key={i} code={t} w={26} h={36} />
          ))}
        </View>
        <View style={styles.candidates}>
          {candidates.map((t) => {
            const on = picked.includes(t);
            return (
              <Pressable
                key={t}
                style={({ pressed }) => [
                  on && styles.sel,
                  pressed && !grading && styles.tilePressed,
                ]}
                disabled={grading}
                onPress={() => onToggleWait(t)}
                accessibilityRole="button"
                accessibilityLabel={tileLabel(t)}
                accessibilityState={{ selected: on }}
                // 牌は 34×47 で 44pt 未満。見た目を変えずタップ領域だけ 44×59 に広げる
                //（gap=8/4 の半分未満なので隣の牌と重ならない）。
                hitSlop={{ top: 6, bottom: 6, left: 5, right: 5 }}
              >
                <MiniTile code={t} w={34} h={47} />
              </Pressable>
            );
          })}
        </View>
        <View style={styles.submitRow}>
          <Pressable
            style={({ pressed }) => [
              styles.submit,
              (grading || picked.length === 0) && styles.submitOff,
              pressed && !grading && picked.length > 0 && styles.pressed,
            ]}
            disabled={grading || picked.length === 0}
            onPress={onSubmitChinitsu}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>回答</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.question}>{QUIZ_KIND_PROMPTS.efficiency}</Text>
      {/* 牌は白地カードに載せず暗い背景へ直接・中央揃え（[決定] 2026-07-25 オーナーレビュー）。 */}
      <View style={styles.hand}>
        {question.tiles.map((t, i) => (
          <Pressable
            key={i}
            style={({ pressed }) => (pressed && !grading ? styles.tilePressed : null)}
            disabled={grading}
            onPress={() => onDiscard(t)}
            accessibilityRole="button"
            accessibilityLabel={tileLabel(t)}
            // 牌は 34×47 で 44pt 未満。見た目を変えずタップ領域だけ 44×59 に広げる。
            hitSlop={{ top: 6, bottom: 6, left: 5, right: 5 }}
          >
            <MiniTile code={t} w={34} h={47} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 16, paddingBottom: 32, gap: 10 },
  title: { color: colors.white, fontSize: 20, fontWeight: "800" },
  section: { gap: 10 },
  // 種目選択カード（牌モチーフ3枚のファン＋タイトル/説明の階層）。
  // 角丸は共通トークン（カード=radius.card・ボタン=radius.base）に統一
  // （[決定] 2026-07-25 オーナーレビュー。KifuCard 等の既存カードと同じ値）。
  card: {
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 18,
    gap: 8,
  },
  cardPressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent },
  cardFan: { flexDirection: "row", gap: 2, paddingLeft: 4, paddingBottom: 2 },
  fanTile: {},
  fanL: { transform: [{ rotate: "-12deg" }, { translateY: 2 }] },
  fanR: { transform: [{ rotate: "12deg" }, { translateY: 2 }] },
  cardTitle: { color: colors.white, fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  cardDesc: { color: colors.w70, fontSize: 12, lineHeight: 19 },
  error: { color: colors.vermilion, fontSize: 13 },
  upgrade: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  upgradeText: { color: "#16181d", fontWeight: "800", fontSize: 13 },
  // セッション中 HUD（残り秒が主役・スコアはチップ・上部の固定バー感）
  hud: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  hudKind: { color: colors.w70, fontSize: 12, fontWeight: "700" },
  hudScore: {
    color: colors.white,
    fontSize: 12,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    overflow: "hidden",
  },
  hudTime: {
    marginLeft: "auto",
    color: colors.emLite,
    fontSize: 21,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  // 残り10秒未満: 要確認カラー #d10f3a 系の赤で焦りを可視化
  hudTimeLow: { color: "#ff5f75" },
  panel: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
  },
  question: { color: colors.w70, fontSize: 12.5, textAlign: "center" },
  // 出題エリアは中央揃え。牌は白地カードに載せず暗い背景へ直接置く。
  hand: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  // 牌姿との間に明確な余白を置く（panel の gap に上乗せ）。
  candidates: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 10,
  },
  sel: {
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 6,
    margin: -2,
    transform: [{ translateY: -4 }],
  },
  tilePressed: { transform: [{ scale: 0.94 }] },
  pressed: { transform: [{ scale: 0.97 }] },
  submitRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 44,
    marginTop: 4,
  },
  // 主ボタンは既存画面（ProblemAnswerScreen .submit）と同じ accent + radius.base
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: 34,
    alignItems: "center",
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  // フィードバック帯（出題パネル直下の固定高さスロット。回答受付中は透明のまま高さを確保し、
  // 回答直後だけ 正解=緑系（emLite 系）/不正解=赤系（#d10f3a 系）に塗る。牌に被せない）
  feedbackBand: {
    height: 46,
    borderRadius: radius.card,
    alignItems: "center",
    justifyContent: "center",
  },
  bandOk: { backgroundColor: "rgba(62,196,135,0.16)" },
  bandNg: { backgroundColor: "rgba(209,15,58,0.16)" },
  bandText: { fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  ok: { color: colors.emLite },
  // 不正解の赤は要確認カラー #d10f3a 系（暗背景でも読める明度に調整）
  ng: { color: "#ff5f75" },
  resultBox: {
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 14,
    gap: 8,
  },
  resultHead: { color: colors.w45, fontSize: 12, fontWeight: "800" },
  resultLine: { color: colors.w70, fontSize: 12.5, fontWeight: "700" },
  // スコアの stat カード横並び（正解数・出題数・正答率）。スリム表示
  // （[決定] 2026-07-25 オーナーレビュー: 数値フォントは維持し縦幅を従来の6〜7割に）
  stats: { flexDirection: "row", gap: 8, marginTop: 2 },
  stat: {
    flex: 1,
    color: colors.white,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingVertical: 7,
    paddingHorizontal: 4,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    overflow: "hidden",
  },
  // 見直しリスト（結果画面のみ）
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
  reviewTiles: { flexDirection: "row", flexWrap: "wrap", gap: 2 },
  reviewLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  // 問題の牌列（13-14枚）はラベルの横で折り返す。
  reviewLineTiles: { flexShrink: 1 },
  reviewLabel: { color: colors.w45, fontSize: 11 },
  // 受け入れ詳細（牌効率のみ。あなたの回答の受け入れ＋正解各打牌の受け入れ）
  ukeireDetail: { gap: 4, marginTop: 2 },
  ukeireLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  ukeireBody: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, flex: 1 },
  ukeireArrow: { color: colors.w45, fontSize: 11 },
  ukeireCount: { color: colors.w70, fontSize: 11, fontVariant: ["tabular-nums"] },
  // 向聴戻しバッジ（要確認カラー #d10f3a 系の赤で警告。REVIEW_COLOR と整合）
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
  sendError: { color: colors.vermilion, fontSize: 12 },
  // 結果画面の操作: 主=もう一度挑戦（accent）／副=問題選択にもどる（線ボタン。
  // ProblemAnswerScreen の redoBtn と同じ「明るい線＋薄い面」の既存フォーム）。
  // 横並びで中央寄せ（[決定] 2026-07-25 オーナーレビュー・web と同構成）
  resultActions: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  retry: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  retryText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
  backBtn: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: radius.base,
    paddingVertical: 10,
    paddingHorizontal: 22,
    alignItems: "center",
  },
  backText: { color: colors.white, fontWeight: "700", fontSize: 13 },
});
