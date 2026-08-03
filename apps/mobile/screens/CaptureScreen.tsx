import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SeatSchema, type Seat, type Tile } from "@rigel/schema";
import {
  analysisQuotaLabel,
  analyzeErrorMessage,
  cameraLabel,
  planCanAnalyze,
  roundNameForSeq,
  seatLabel,
  ANALYSIS_BUSY_MESSAGE,
  LIMIT_MESSAGES,
} from "@rigel/ui";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MiniTile } from "../components/MiniTile";
import { RoundPicker } from "../components/RoundPicker";
import { Stepper } from "../components/Stepper";
import { TilePickerSheet } from "../components/editor/TilePickerSheet";
import { analyze, createEmptyKifu, createGame } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { pickImage, type PickedImage as Picked } from "../lib/pick-image";
import { colors } from "../lib/theme";
import { toUploadFile } from "../lib/upload";
import { useAnalysisJob } from "../lib/use-analysis-job";

type Nav = NativeStackNavigationProp<RootStackParamList, "Capture">;

const CAMS = ["bottom", "right", "top", "left"] as const;

export function CaptureScreen() {
  const nav = useNavigation<Nav>();
  // gameId があれば既存半荘への局追加（半荘詳細の「＋局を追加」から来る）。
  const gameId = useRoute<RouteProp<RootStackParamList, "Capture">>().params?.gameId;
  const { token, user } = useAuth();
  // 解析ジョブの開始（ポーリングはグローバル Provider の責務。lib/use-analysis-job）。
  const { start: startAnalysis, busy: analysisBusy } = useAnalysisJob();
  // 写真からのAI再現は有料プランのみ（free は解析枠0）。フリーには写真入力を出さない。
  const canAnalyze = planCanAnalyze(user?.plan ?? "free");
  // 残枠は撮る前に見せる（送信後の 403 で知るのでは撮影の手間が無駄になる）。
  const quotaLabel = analysisQuotaLabel(user?.remainingCalls, user?.monthlyCallQuota);
  const [seat, setSeat] = useState<Seat>("east");
  // 作成する局（東一局=1〜北四局=16）。半荘内の好きな局を1つだけ作れる。
  const [seq, setSeq] = useState(1);
  const [river, setRiver] = useState<Picked | null>(null);
  const [hands, setHands] = useState<Partial<Record<(typeof CAMS)[number], Picked>>>({});
  // 1枚モード: 河写真に自分の手牌も写して、その1枚から手前の手牌も読む
  // （docs/plans/one-shot-hand.md。解析回数 +1）。ON 中は「あなたの手牌」欄を隠す。
  const [handFromRiver, setHandFromRiver] = useState(false);
  // 手入力で焼き込む局メタ（本場/供託/ドラ。web AddKyokuModal の手動タブと同一。Phase D）。
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0);
  const [dora, setDora] = useState<Tile | null>(null);
  const [doraOpen, setDoraOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false); // 手入力作成。解析(submitting)とは独立。
  // エラーは押したボタンの近くに出す（解析=写真セクション直下 / 手入力=作成ボタン直上。
  // 長いフォームで最下部のボタンを押したのに画面中程にしか出ないと無反応に見えるため）。
  const [error, setError] = useState<string | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const busy = submitting || creating;

  /** 写真なしの手入力作成。既存半荘には局を足し、無ければ新しい半荘を作って編集画面へ。 */
  async function onCreateManual() {
    if (!token) {
      setManualError("サインインが必要です。");
      return;
    }
    setManualError(null);
    setCreating(true);
    try {
      // 局メタ（ドラは複数枚スキーマ。作成時は1枚だけ選べる。追加は編集画面で）。
      const meta = { honba, kyotaku, dora: dora ? [dora] : [] };
      const res = gameId
        ? await createEmptyKifu(token, gameId, seat, meta, seq)
        : await createGame(token, seat, meta, seq);
      if (res.ok) nav.navigate("Edit", { gameId: res.gameId, logId: res.logId });
      else if (res.status === 409) setManualError(LIMIT_MESSAGES.gameFull);
      else if (res.status === 403) setManualError(LIMIT_MESSAGES.draftGames);
      else setManualError("作成に失敗しました。");
    } catch {
      setManualError("通信に失敗しました。");
    } finally {
      setCreating(false);
    }
  }

  /** 写真を選んで onPicked に渡す。拒否時は設定誘導（pickImage 内）＋インライン表示。 */
  async function pickInto(onPicked: (file: Picked) => void) {
    const result = await pickImage();
    if (result.status === "picked") {
      setError(null);
      onPicked(result.file);
    } else if (result.status === "denied") {
      setError("写真へのアクセスが許可されていません。設定アプリから許可してください。");
    }
  }

  async function onSubmit() {
    if (!token) {
      setError("サインインが必要です。");
      return;
    }
    if (!river) {
      setError("河（卓を上から1枚）の写真を選んでください。");
      return;
    }
    // 多重送信ガードは POST の前に行う（202 の後に断ると、サーバー側では既に
    // 半荘作成・キュー投入・課金が走ってしまう）。
    if (analysisBusy) {
      setError(ANALYSIS_BUSY_MESSAGE);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const form = new FormData();
      // 写真は expo-file-system の File に変換して載せる（lib/upload.ts。expo/fetch の
      // FormData は {uri,name,type} オブジェクトを受け付けないため）。
      form.append("river", toUploadFile(river));
      form.append("cameraBottomSeat", seat);
      if (gameId) form.append("gameId", gameId); // 既存半荘への局追加
      if (handFromRiver) form.append("handFromRiver", "true"); // 1枚モード（四家。トグルONで hands は空）
      for (const cam of CAMS) {
        const f = hands[cam];
        if (f) form.append(`hand_${cam}`, toUploadFile(f));
      }
      // 解析は非同期ジョブ（202 + jobId）。ポーリングはグローバルな Provider に任せ、
      // この画面は一覧へ戻る（一覧の先頭に解析中カードが出る。案B・plan 8-2）。
      const result = await analyze(token, form);
      if (!result.ok) {
        setError(analyzeErrorMessage(result.status, result.reason));
        return;
      }
      const started = await startAnalysis({ jobId: result.jobId, startedAt: Date.now(), seq });
      if (!started) {
        // 進行中のジョブがあるときは開始しない（保存枠を潰して1件目を行方不明にしない）。
        setError(ANALYSIS_BUSY_MESSAGE);
        return;
      }
      nav.goBack();
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // シート（BottomSheet=absoluteFill）はスクロール内容の外に置くため、ルートは View。
    <View style={styles.root}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
        {gameId ? (
          <Text style={styles.addNote}>
            この半荘に局を追加します{canAnalyze ? "（写真解析 または 手入力）" : "（手入力）"}。
          </Text>
        ) : null}
        {/* 作成する局（半荘内の好きな局を1つだけ作れる）。 */}
        <Text style={styles.label}>作成する局（{roundNameForSeq(seq)}）</Text>
        <RoundPicker value={seq} onChange={setSeq} />

        {/* 手前席は全プラン共通で選べる（手入力にも使う。以前は手入力=東固定。Phase D）。
          写真解析では相対→絶対変換にも使うため、有料は撮影時の向きが分かる文言にする。 */}
        <Text style={styles.label}>{canAnalyze ? "撮影時に手前だった席" : "手前の席"}</Text>
        <View style={styles.seatRow}>
          {SeatSchema.options.map((s) => (
            <Pressable
              key={s}
              onPress={() => setSeat(s)}
              style={[styles.seatBtn, seat === s && styles.seatActive]}
            >
              <Text style={seat === s ? styles.seatActiveText : undefined}>{seatLabel(s)}</Text>
            </Pressable>
          ))}
        </View>

        {/* 写真からのAI再現は有料プランのみ（free は枠0）。フリーには写真入力を出さない。 */}
        {canAnalyze ? (
          <>
            {quotaLabel ? <Text style={styles.quota}>{quotaLabel}</Text> : null}

            <Text style={styles.label}>河（卓を上から1枚）*</Text>
            <Pressable style={styles.pick} onPress={() => void pickInto(setRiver)}>
              {river ? (
                <Image source={{ uri: river.uri }} style={styles.thumb} />
              ) : (
                <Text style={styles.pickText}>河の写真を選ぶ</Text>
              )}
            </Pressable>

            {/* 1枚モードのトグル（河ピッカー直下。[決定] 2026-08-02 四家対応・文言は「手牌を含む」）。
              対局終了時に全員が手牌を開けて撮った1枚から、四家の手牌もまとめて読む。 */}
            <Pressable
              style={styles.tgl}
              onPress={() => {
                setHandFromRiver((v) => !v);
                // 二重指定の混乱を防ぐ: モード切替時は明示の手牌選択を破棄。
                setHands({});
              }}
              accessibilityRole="switch"
              accessibilityState={{ checked: handFromRiver }}
              accessibilityLabel="手牌を含む"
              accessibilityHint="写真に写っている各家の手牌もこの1枚から読み取ります。解析回数を最大4回分多く使います"
            >
              <View style={[styles.tglBox, handFromRiver && styles.tglBoxOn]}>
                {handFromRiver ? <Text style={styles.tglTick}>✓</Text> : null}
              </View>
              <View style={styles.tglBody}>
                <Text style={styles.tglLabel}>手牌を含む</Text>
                <Text style={styles.tglSub}>
                  写真に写っている各家の手牌もこの1枚から読み取ります（解析回数を最大4回分多く使います）
                </Text>
              </View>
            </Pressable>

            {/* 1枚モード ON では個別の手牌写真は不要（明示指定は API 側で優先されるが UI は簡潔に）。 */}
            {handFromRiver ? null : (
              <>
                <Text style={styles.label}>各家の手牌（任意）</Text>
                {CAMS.map((cam) => (
                  <Pressable
                    key={cam}
                    style={styles.handRow}
                    onPress={() => void pickInto((p) => setHands((h) => ({ ...h, [cam]: p })))}
                  >
                    <Text style={styles.handLabel}>{cameraLabel(cam)}</Text>
                    {hands[cam] ? (
                      <Image source={{ uri: hands[cam]?.uri }} style={styles.thumbSmall} />
                    ) : (
                      <Text style={styles.pickText}>選ぶ</Text>
                    )}
                  </Pressable>
                ))}
              </>
            )}
          </>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canAnalyze ? (
          <>
            <Pressable
              disabled={busy || !river}
              onPress={() => void onSubmit()}
              style={[styles.submit, (busy || !river) && styles.submitDisabled]}
              accessibilityRole="button"
            >
              {/* 非同期化後は待つのは送信（アップロード）だけ。解析の進行は一覧のカードが示す。 */}
              <Text style={styles.submitText}>{submitting ? "送信中…" : "解析して保存"}</Text>
            </Pressable>

            {/* 解析とは別導線。区切りを置いて誤タップ・状態の取り違えを防ぐ。 */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>または</Text>
              <View style={styles.orLine} />
            </View>
          </>
        ) : null}

        {/* 手入力の局メタ（本場/供託/ドラ。web AddKyokuModal の手動タブと同一。任意）。 */}
        <Text style={styles.label}>手入力の局情報（任意。写真解析では使いません）</Text>
        <Stepper label="本場" unit="本場" value={honba} min={0} max={19} onChange={setHonba} />
        <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} onChange={setKyotaku} />
        <View style={styles.doraRow}>
          <Text style={styles.doraLabel}>ドラ表示牌</Text>
          <Pressable
            style={styles.doraBtn}
            onPress={() => setDoraOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="ドラ表示牌を選ぶ"
          >
            {dora ? (
              <MiniTile code={dora} w={28} h={38} />
            ) : (
              <Text style={styles.pickText}>選ぶ</Text>
            )}
          </Pressable>
          {dora ? (
            <Pressable
              onPress={() => setDora(null)}
              accessibilityRole="button"
              accessibilityLabel="ドラ表示牌を外す"
              hitSlop={8}
            >
              <Text style={styles.doraClear}>外す</Text>
            </Pressable>
          ) : null}
        </View>

        {/* 手入力側の失敗はボタンの直上に出す（押した場所の近く）。 */}
        {manualError ? <Text style={styles.error}>{manualError}</Text> : null}
        {/* 写真なしの手入力作成（空の初局を作って編集画面へ）。フリーはこれが主ボタン。 */}
        <Pressable
          disabled={busy}
          onPress={() => void onCreateManual()}
          style={[canAnalyze ? styles.manual : styles.submit, busy && styles.submitDisabled]}
          accessibilityRole="button"
        >
          <Text style={canAnalyze ? styles.manualText : styles.submitText}>
            {creating ? "作成中…" : "手入力で作成"}
          </Text>
        </Pressable>

        {!canAnalyze ? (
          <Text style={styles.upsell}>
            写真からのAI再現（撮影→自動で牌譜化）は有料プラン（Next / Pro）で利用できます。
          </Text>
        ) : null}
      </ScrollView>

      {doraOpen ? (
        <TilePickerSheet
          title="ドラ表示牌"
          onPick={(t) => {
            setDora(t);
            setDoraOpen(false);
          }}
          onClose={() => setDoraOpen(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  container: { padding: 16, gap: 10 },
  addNote: { color: colors.accent, fontSize: 12.5, fontWeight: "700" },
  quota: { color: colors.w45, fontSize: 12 },
  // 1枚モードのトグル行（チェックボックス風。seatBtn 等と同じ枠色）。
  tgl: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 2 },
  tglBox: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderColor: colors.w45,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  tglBoxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tglTick: { color: "#16181d", fontSize: 13, fontWeight: "800", lineHeight: 16 },
  tglBody: { flex: 1, gap: 2 },
  tglLabel: { color: colors.white, fontSize: 13.5, fontWeight: "700" },
  tglSub: { color: colors.w45, fontSize: 11.5, lineHeight: 17 },
  label: { color: colors.w70, fontSize: 13, marginTop: 6 },
  seatRow: { flexDirection: "row", gap: 8 },
  seatBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.chrome2,
  },
  seatActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  seatActiveText: { color: "#16181d", fontWeight: "700" },
  pick: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    backgroundColor: colors.chrome,
  },
  pickText: { color: colors.accent },
  thumb: { width: 120, height: 90, borderRadius: 6 },
  thumbSmall: { width: 44, height: 44, borderRadius: 4 },
  handRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.chrome,
  },
  handLabel: { color: colors.w70 },
  error: { color: colors.danger, fontSize: 14 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { backgroundColor: colors.chrome3, opacity: 0.6 },
  submitText: { color: "#16181d", fontSize: 15, fontWeight: "700" },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 8 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  orText: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  manual: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 13,
    alignItems: "center",
  },
  manualText: { color: colors.accent, fontSize: 14, fontWeight: "700" },
  // 手入力の局メタ: ドラ表示牌の選択行。
  doraRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  doraLabel: { color: colors.w70, fontSize: 13 },
  doraBtn: {
    minWidth: 52,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.chrome,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  doraClear: { color: colors.w45, fontSize: 12.5, fontWeight: "700" },
  upsell: { color: colors.w45, fontSize: 12, lineHeight: 17, marginTop: 6 },
});
