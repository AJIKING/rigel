import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  RulesSchema,
  type Kifu,
  type Meld,
  type Problem,
  type ProblemKind,
  type Seat,
  type Tile,
} from "@rigel/schema";
import {
  addDraftMeld,
  analysisQuotaLabel,
  analyzeErrorMessage,
  pollProblemAnalysisOutcome,
  problemAnalysisTimeoutMessage,
  assembleProblem,
  compareTiles,
  draftToKifu,
  kifuToProblemDraft,
  parseRiverEditTarget,
  planCanAnalyze,
  problemHandMax,
  problemRiverTiles,
  problemRoundLabel,
  removeDraftRiverTile,
  replaceDraftRiverTile,
  seatLabel,
  tileLabel,
  toggleDraftRiverTsumogiri,
  LIMIT_MESSAGES,
  SEAT_ORDER,
  type DraftRiverTile,
  type MeldPick,
} from "@rigel/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BoardTable } from "../components/BoardTable";
import { CenterState } from "../components/CenterState";
import { Chip } from "../components/Chip";
import { MiniTile } from "../components/MiniTile";
import { Segment } from "../components/Segment";
import { Stepper } from "../components/Stepper";
import { ProblemPhotosSheet } from "../components/ProblemPhotosSheet";
import { RulesSheet } from "../components/editor/RulesSheet";
import { TilePickerSheet } from "../components/editor/TilePickerSheet";
import {
  analyzeProblem,
  createProblem,
  getProblem,
  getProblemAnalysisJob,
  getProblemDraft,
  updateProblem,
  type ProblemPost,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import type { RootStackParamList } from "../lib/navigation";
import { pickImage, type PickedImage } from "../lib/pick-image";
import { KIND_LABELS } from "../lib/problems";
import { colors, radius } from "../lib/theme";
import { toUploadFile } from "../lib/upload";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProblemEdit">;

/** 牌ピッカーの入力先。null=閉じている。riveredit の分解は @rigel/ui（parseRiverEditTarget）。 */
type Target =
  | "hand"
  | "drawn"
  | "dora"
  | `river:${Seat}`
  | `riveredit:${Seat}:${number}`
  | `meld:${MeldPick}`
  | null;

const MELD_PICKS: { type: MeldPick; label: string }[] = [
  { type: "pon", label: "副露:ポン" },
  { type: "chi", label: "副露:チー" },
  { type: "kan", label: "副露:カン" },
];

/**
 * 何切る問題の作成/編集画面（route params の problemId 有無で切替）。
 * 手牌・ツモ・ドラ・各席の河・副露を TilePickerSheet で入力し、出題者のコメントを付けて保存する。
 * 正解は設けない（多様な正解を前提に、回答の分布を見る）。
 * 保存前にクライアントでも ProblemSchema で検証し、エラーは日本語で表示する（web 版と同挙動）。
 */
export function ProblemEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "ProblemEdit">>();
  const { token } = useAuth();
  const problemId = route.params?.problemId;
  const [loading, setLoading] = useState(problemId !== undefined);
  const [initial, setInitial] = useState<ProblemPost | null>(null);

  useEffect(() => {
    if (!problemId) return;
    let active = true;
    getProblem(problemId, token ?? undefined)
      .catch(() => null)
      .then((p) => {
        if (active) {
          setInitial(p);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [problemId, token]);

  if (loading) return <CenterState loading />;
  if (problemId && !initial) return <CenterState message="問題が見つかりません。" />;
  return (
    <EditorBody initial={initial ?? undefined} token={token} draftId={route.params?.draftId} />
  );
}

function EditorBody({
  initial,
  token,
  draftId,
}: {
  initial?: ProblemPost;
  token: string | null;
  /** 解析下書き（photo-retention.md）から開く場合の ID。結果を流し込み、保存で写真を引き継ぐ。 */
  draftId?: string;
}) {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const p0 = initial?.problem;
  // 写真からのAI再現は有料プランのみ（free は解析枠0。kifu の Capture と同一方針）。
  const canAnalyze = planCanAnalyze(user?.plan ?? "free");
  // 残枠は撮る前に見せる（送信後の枠切れで撮影の手間を無駄にしない。Capture と同方針）。
  const quotaLabel = analysisQuotaLabel(user?.remainingCalls, user?.monthlyCallQuota);

  const [kind, setKind] = useState<ProblemKind>(p0?.kind ?? "discard");
  const [pov, setPov] = useState<Seat>(p0?.pov ?? "east");
  const [hand, setHand] = useState<Tile[]>(
    p0 ? p0.seats[p0.pov].hand.flatMap((t) => (t.tile ? [t.tile] : [])) : [],
  );
  const [melds, setMelds] = useState<Meld[]>(p0 ? p0.seats[p0.pov].melds : []);
  const [drawn, setDrawn] = useState<Tile | null>(p0?.drawn ?? null);
  const [rivers, setRivers] = useState<Record<Seat, DraftRiverTile[]>>(() => problemRiverTiles(p0));
  const [dora, setDora] = useState<Tile[]>(p0?.meta.dora ?? []);
  const [targetSeat, setTargetSeat] = useState<Seat>(p0?.targetSeat ?? "south");
  const [roundWind, setRoundWind] = useState<Seat>(p0?.meta.roundWind ?? "east");
  const [dealer, setDealer] = useState<Seat>(p0?.meta.dealer ?? "east");
  const [junme, setJunme] = useState(p0?.meta.junme ?? 6);
  const [honba, setHonba] = useState(p0?.meta.honba ?? 0);
  const [kyotaku, setKyotaku] = useState(p0?.meta.kyotaku ?? 0);
  const [scoresOn, setScoresOn] = useState(p0?.scores != null);
  const [scores, setScores] = useState<Record<Seat, string>>({
    east: String(p0?.scores?.east ?? 25000),
    south: String(p0?.scores?.south ?? 25000),
    west: String(p0?.scores?.west ?? 25000),
    north: String(p0?.scores?.north ?? 25000),
  });
  // ルール設定（web ProblemEditorScreen の RulesDialog と対。RulesSheet を流用。Phase D）。
  const [rules, setRules] = useState(() => p0?.rules ?? RulesSchema.parse({}));
  const [rulesOpen, setRulesOpen] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [explanation, setExplanation] = useState(p0?.explanation ?? "");

  const [target, setTarget] = useState<Target>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 写真からのAI再現（手牌=必須・河=任意）。流し込み後は readingNotes で人の確認を促す。
  // 新規作成は開いて出す。既存問題の編集では折りたたみ既定（見出しタップで開ける）。
  const [photoOpen, setPhotoOpen] = useState(!initial);
  const [handPhoto, setHandPhoto] = useState<PickedImage | null>(null);
  const [riverPhoto, setRiverPhoto] = useState<PickedImage | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [readingNotes, setReadingNotes] = useState("");
  const [aiReview, setAiReview] = useState("");
  // 保存時に写真を引き継ぐ解析下書き（route param か、画面内の写真AI再現で紐づく）。
  const [linkedDraftId, setLinkedDraftId] = useState<string | null>(draftId ?? null);
  const [photosOpen, setPhotosOpen] = useState(false);
  // 画面破棄でポーリングを中断する（アンマウント後の setState と無駄なリクエストを防ぐ）。
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 解析下書きから開いたときの流し込み（一度だけ。ready 以外は案内を出す）。
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (!draftId || !token || draftLoaded.current) return;
    draftLoaded.current = true;
    getProblemDraft(token, draftId)
      .then((d) => {
        if (!d) setErr("解析下書きが見つかりませんでした。");
        else if (d.draft) applyAiDraft(d.draft);
        else if (d.status === "processing") setErr("この下書きはまだ解析中です。");
        else setErr("この下書きは解析に失敗しています。写真からやり直してください。");
      })
      .catch(() => setErr("解析下書きを読み込めませんでした。"));
  }, [draftId, token]);

  /** 写真を選んで onPicked に渡す（Capture と同じ流儀）。 */
  async function pickInto(onPicked: (file: PickedImage) => void) {
    const result = await pickImage();
    if (result.status === "picked") {
      setErr(null);
      onPicked(result.file);
    } else if (result.status === "denied") {
      setErr("写真へのアクセスが許可されていません。設定アプリから許可してください。");
    }
  }

  /** AIドラフト（Kifu 形）をエディタの各状態へ流し込む（変換は @rigel/ui＝web と同一挙動）。 */
  function applyAiDraft(kifu: Kifu) {
    const { draft, readingNotes: notes } = kifuToProblemDraft(kifu, pov);
    setHand(draft.hand);
    setMelds(draft.melds);
    setDrawn(draft.drawn);
    setRivers(draft.rivers);
    setDora(draft.meta.dora);
    setJunme(draft.meta.junme);
    setHonba(draft.meta.honba);
    setKyotaku(draft.meta.kyotaku);
    if (draft.meta.dealer) setDealer(draft.meta.dealer);
    if (draft.meta.roundWind) setRoundWind(draft.meta.roundWind);
    setReadingNotes(notes);
    // AI ドラフトは全牌目検が前提（[決定] 2026-07-24: confidence 廃止）。
    setAiReview("AIの読み取り結果です。牌を目で確認してから保存してください。");
    setErr(null);
  }

  async function onAnalyzePhotos() {
    if (!token) {
      setErr("サインインが必要です。");
      return;
    }
    if (!handPhoto) {
      setErr("自分の手牌の写真を選んでください。");
      return;
    }
    setErr(null);
    setAnalyzing(true);
    try {
      const form = new FormData();
      // 写真は expo-file-system の File に変換（lib/upload.ts。CaptureScreen と同じ理由）。
      form.append("hand", toUploadFile(handPhoto));
      if (riverPhoto) form.append("river", toUploadFile(riverPhoto));
      form.append("cameraBottomSeat", pov);
      // 解析は非同期ジョブ（202 + ポーリング。async-analysis.md Task 8・[決定] 2026-08-02）。
      // 実写真は数分に達しうるため接続を握ったまま待たない。画面破棄で中断（ジョブは進む）。
      const result = await analyzeProblem(token, form);
      if (!result.ok) {
        setErr(analyzeErrorMessage(result.status, result.reason));
        return;
      }
      // 解析下書きが先行作成される（photo-retention.md）。保存時に写真を引き継ぐ。
      // 旧 API 応答（draftId なし）で既存のリンクを潰さない。
      if (result.draftId) setLinkedDraftId(result.draftId);
      const outcome = await pollProblemAnalysisOutcome(
        () => getProblemAnalysisJob(token, result.jobId),
        Date.now(),
        undefined,
        () => !aliveRef.current,
      );
      if (outcome.kind === "cancelled") return;
      if (outcome.kind === "done") applyAiDraft(outcome.kifu);
      else setErr(outcome.kind === "failed" ? outcome.message : problemAnalysisTimeoutMessage());
    } catch {
      if (aliveRef.current) setErr("通信に失敗しました。");
    } finally {
      if (aliveRef.current) setAnalyzing(false);
    }
  }
  // 盤面プレビュー（牌譜と同じ回転卓に編集内容を即時反映。KifuEditor と同じ折りたたみ・既定 open）。
  const [previewOpen, setPreviewOpen] = useState(true);
  const { width } = useWindowDimensions();

  const handMax = problemHandMax(melds.length);
  const sortedHand = [...hand].sort(compareTiles);

  // 編集途中でも検証なしで Kifu へ写して描く（枚数不足でもプレビューできる）。
  const previewKifu = useMemo(
    () =>
      draftToKifu({
        pov,
        hand,
        melds,
        rivers,
        meta: { dealer, roundWind, honba, kyotaku, junme, dora },
        rules,
      }),
    [pov, hand, melds, rivers, dealer, roundWind, honba, kyotaku, junme, dora, rules],
  );
  // 鳴き判断は対象席の河の末尾＝対象牌を卓上で強調（回答画面と同じ見え方）。
  const previewHighlight =
    kind === "call" && rivers[targetSeat].length > 0
      ? { seat: targetSeat, index: rivers[targetSeat].length - 1 }
      : null;
  const previewRoundLabel = problemRoundLabel({ roundWind, junme });
  const previewSize = Math.max(240, Math.min(width - 28, 340));

  function onPick(code: Tile) {
    setErr(null);
    if (!target) return;
    // 手牌・河・ドラは連続入力（ピッカーを開いたまま）。ツモ・副露は1回で閉じる。
    if (target === "hand") {
      // 黙って捨てない: 置けない理由と解決手段を必ず知らせる（袋小路防止・web と同文言）。
      if (hand.length >= handMax) {
        setErr(`手牌は${handMax}枚までです（置いた牌はタップで外せます）。`);
        return;
      }
      const next = [...hand, code];
      setHand(next);
      // 13枚に達したら入力先を自動でツモ牌へ（切替忘れで「ツモ牌が必須」に悩ませない）。
      if (kind === "discard" && next.length >= handMax && drawn === null) setTarget("drawn");
      return;
    }
    if (target === "drawn") {
      setDrawn(code);
      setTarget(null);
      return;
    }
    if (target === "dora") {
      if (dora.length >= 5) {
        setErr("ドラ表示牌は5枚までです（置いた牌はタップで外せます）。");
        return;
      }
      setDora((cur) => [...cur, code]);
      return;
    }
    if (target.startsWith("river:")) {
      const seat = target.slice("river:".length) as Seat;
      // 置くときは手出し。ツモ切りは牌タップ→編集ピッカーで後から切り替える。
      setRivers((cur) => ({ ...cur, [seat]: [...cur[seat], { tile: code, tsumogiri: false }] }));
      return;
    }
    const riveredit = parseRiverEditTarget(target);
    if (riveredit) {
      // 既存の河の牌を置き換える（ツモ切りフラグは保持）。置き換えたら閉じる。
      setRivers((cur) => replaceDraftRiverTile(cur, riveredit.seat, riveredit.index, code));
      setTarget(null);
      return;
    }
    const type = target.slice("meld:".length) as MeldPick;
    // 副露の生成と手牌の3枚換算圧迫は共有純関数（web と同一挙動）。
    const next = addDraftMeld(hand, melds, type, code);
    setHand(next.hand);
    setMelds(next.melds);
    setTarget(null);
  }

  function removeHandAt(i: number) {
    const tile = sortedHand[i];
    if (!tile) return;
    setHand((cur) => {
      const j = cur.indexOf(tile);
      return j < 0 ? cur : [...cur.slice(0, j), ...cur.slice(j + 1)];
    });
    // 外した＝手牌を直したいはず。ツモ牌の誤上書きを防ぐ（mobile はピッカーを閉じる）。
    if (target === "drawn") setTarget(null);
  }

  /** 編集状態→Problem の組み立て・検証は共有純関数（web と同一挙動）。 */
  function build(): { problem?: Problem; error?: string } {
    return assembleProblem({
      kind,
      pov,
      hand,
      melds,
      drawn,
      targetSeat,
      rivers,
      meta: { dealer, roundWind, honba, kyotaku, junme, dora },
      scores: scoresOn ? scores : null,
      rules,
      explanation,
    });
  }

  async function save(status: "draft" | "published") {
    if (!token) {
      setErr("サインインが必要です。");
      return;
    }
    const { problem, error } = build();
    if (!problem) {
      setErr(error ?? null);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = initial
      ? await updateProblem(token, initial.id, { title, problem, status }).catch(() => ({
          ok: false,
          status: 0,
        }))
      : await createProblem(token, {
          title,
          problem,
          status,
          // 解析下書き由来なら写真を引き継ぐ（photo-retention.md）。
          ...(linkedDraftId ? { draftId: linkedDraftId } : {}),
        }).catch(() => ({
          ok: false,
          status: 0,
        }));
    setBusy(false);
    if (res.ok) {
      nav.goBack();
      return;
    }
    setErr(res.status === 403 ? LIMIT_MESSAGES.problems : "保存に失敗しました。");
  }

  /** ピッカーの見出し（入力先ごと）。 */
  function pickerTitleOf(t: Target): string {
    if (t === "hand") return `手牌に追加（${hand.length}/${handMax}枚）`;
    if (t === "drawn") return "ツモ牌を選ぶ";
    if (t === "dora") return `ドラ表示牌を追加（${dora.length}/5枚）`;
    if (t?.startsWith("river:")) {
      return `${seatLabel(t.slice("river:".length) as Seat)}家の河に追加`;
    }
    const re = parseRiverEditTarget(t);
    if (re) return `${seatLabel(re.seat)}家の河${re.index + 1}を変更`;
    if (t) return `${MELD_PICKS.find((m) => `meld:${m.type}` === t)?.label}を追加`;
    return "";
  }
  const pickerTitle = pickerTitleOf(target);
  // 河の牌の編集中はピッカーに「ツモ切り」「削除」を出す（チップの✕は廃止）。
  const riverEdit = parseRiverEditTarget(target);
  const riverEditTile = riverEdit ? rivers[riverEdit.seat][riverEdit.index] : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body}>
        <TextInput
          style={styles.input}
          value={title}
          maxLength={80}
          placeholder="タイトル"
          placeholderTextColor={colors.w45}
          accessibilityLabel="タイトル"
          onChangeText={setTitle}
        />

        {/* 写真からのAI再現（有料のみ）。手牌・河のベースを流し込み、作者が修正する。
            新規作成では開いて出す。既存問題の編集では盤面が既に埋まっていて出番が薄いので
            折りたたみ既定（見出しタップで開ける）。 */}
        {canAnalyze ? (
          <View style={styles.photoBox}>
            <Pressable
              onPress={() => setPhotoOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: photoOpen }}
            >
              <Text style={styles.rowLabel}>{photoOpen ? "▾" : "▸"} 写真から作成（AI再現）</Text>
            </Pressable>
            {photoOpen ? (
              <>
                {quotaLabel ? <Text style={styles.hint}>{quotaLabel}</Text> : null}
                <Pressable
                  style={styles.photoBtn}
                  onPress={() => void pickInto(setHandPhoto)}
                  accessibilityRole="button"
                >
                  <Text style={styles.photoBtnText}>
                    {handPhoto ? `手牌の写真: ${handPhoto.name}` : "手牌の写真を選ぶ（必須）"}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.photoBtn}
                  onPress={() => void pickInto(setRiverPhoto)}
                  accessibilityRole="button"
                >
                  <Text style={styles.photoBtnText}>
                    {riverPhoto ? `河の写真: ${riverPhoto.name}` : "河の写真を選ぶ（任意）"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.photoGo, analyzing && styles.photoGoOff]}
                  disabled={analyzing}
                  onPress={() => void onAnalyzePhotos()}
                  accessibilityRole="button"
                >
                  <Text style={styles.photoGoText}>{analyzing ? "解析中" : "AI再現"}</Text>
                </Pressable>
                <Text style={styles.hint}>読み違いは下の編集で直せます。</Text>
              </>
            ) : null}
          </View>
        ) : null}
        {/* AIの読み取りメモ（グレア・見切れ等）と目検確認の促し。 */}
        {readingNotes ? <Text style={styles.hint}>読み取りメモ: {readingNotes}</Text> : null}
        {aiReview ? <Text style={styles.hint}>{aiReview}</Text> : null}
        {/* 元写真（恒久保存・所有者のみ）。解析下書き由来のときだけ出す。 */}
        {linkedDraftId || initial?.photoDraftId ? (
          <View style={styles.segRow}>
            <Chip label="元写真" a11ySelected={false} onPress={() => setPhotosOpen(true)} />
          </View>
        ) : null}

        {/* 出題形式 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>出題形式</Text>
          <Segment
            options={(["discard", "call"] as const).map((k) => [k, KIND_LABELS[k]] as const)}
            value={kind}
            onChange={(k) => {
              setKind(k);
              // 鳴き判断にツモ牌は無い。見えない入力先に置かせない（ピッカーを閉じる）。
              if (k === "call" && target === "drawn") setTarget(null);
            }}
          />
        </View>

        {/* 視点・鳴き判断の対象席 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>自分の席</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, seatLabel(s)] as const)}
            value={pov}
            onChange={(s) => {
              setPov(s);
              // 対象席（鳴き判断）は自分と同席にできない。選べない値のまま残さない（web と同形）。
              setTargetSeat((cur) => (cur === s ? (SEAT_ORDER.find((x) => x !== s) ?? cur) : cur));
            }}
          />
        </View>
        {kind === "call" ? (
          <>
            <View style={styles.segRow}>
              <Text style={styles.rowLabel}>誰の捨て牌</Text>
              <Segment
                options={SEAT_ORDER.filter((s) => s !== pov).map(
                  (s) => [s, `${seatLabel(s)}家`] as const,
                )}
                value={targetSeat}
                onChange={setTargetSeat}
              />
            </View>
            <Text style={styles.hint}>
              対象席の河の最後の1枚が「鳴くかどうか」の対象牌になります。河に対象牌まで並べてください。
            </Text>
          </>
        ) : null}

        {/* 局情報 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>場風</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, `${seatLabel(s)}場`] as const)}
            value={roundWind}
            onChange={setRoundWind}
          />
        </View>
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>親</Text>
          <Segment
            options={SEAT_ORDER.map((s) => [s, seatLabel(s)] as const)}
            value={dealer}
            onChange={setDealer}
          />
        </View>
        <View style={styles.metaBox}>
          <Stepper label="巡目" unit="巡目" value={junme} min={1} max={30} onChange={setJunme} />
          <Stepper label="本場" unit="本場" value={honba} min={0} max={19} onChange={setHonba} />
          <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} onChange={setKyotaku} />
        </View>

        {/* ルール設定（点数計算の前提。問題にも保存される）。 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>ルール</Text>
          <Chip label="ルール設定" a11ySelected={false} onPress={() => setRulesOpen(true)} />
        </View>

        {/* 点数状況 */}
        <View style={styles.segRow}>
          <Text style={styles.rowLabel}>点数状況</Text>
          <Chip
            label={scoresOn ? "入力する（表示中）" : "入力しない"}
            on={scoresOn}
            onPress={() => setScoresOn((v) => !v)}
          />
        </View>
        {scoresOn ? (
          <View style={styles.scoreRow}>
            {SEAT_ORDER.map((seat) => (
              <View key={seat} style={styles.scoreCell}>
                <Text style={styles.scoreLabel}>{seatLabel(seat)}</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={scores[seat]}
                  keyboardType="number-pad"
                  accessibilityLabel={`${seatLabel(seat)}家の持ち点`}
                  onChangeText={(v) => setScores((cur) => ({ ...cur, [seat]: v }))}
                />
              </View>
            ))}
          </View>
        ) : null}

        {/* 盤面プレビュー（牌譜と同じ回転卓。編集内容を即時反映） */}
        <Pressable
          style={styles.prevHead}
          onPress={() => setPreviewOpen((v) => !v)}
          accessibilityRole="button"
        >
          <Text style={styles.prevHeadText}>{previewOpen ? "▾" : "▸"} プレビュー</Text>
        </Pressable>
        {previewOpen ? (
          <View style={styles.prevWrap}>
            <BoardTable
              kifu={previewKifu}
              bottomSeat={pov}
              dealer={dealer}
              roundLabel={previewRoundLabel}
              showHands={false}
              size={previewSize}
              highlightRiver={previewHighlight}
              // 入力（自分の席・親）が絶対席なので、プレートも絶対席で出す（ずれ防止）。
              absolutePlates
            />
          </View>
        ) : null}

        {/* ドラ */}
        <TileRow
          label="ドラ表示牌"
          tiles={dora}
          removeLabel={(t, i) => `ドラ表示牌${i + 1}（${tileLabel(t)}）を外す`}
          onRemove={(i) => setDora((cur) => cur.filter((_, j) => j !== i))}
          addLabel="ドラ表示牌を追加"
          onAdd={dora.length < 5 ? () => setTarget("dora") : undefined}
        />

        {/* 手牌（理牌表示・タップで削除） */}
        <Text style={styles.section}>
          手牌（{hand.length}/{handMax}枚）
        </Text>
        <View style={styles.tiles}>
          {sortedHand.map((t, i) => (
            <Pressable
              key={`${t}-${i}`}
              onPress={() => removeHandAt(i)}
              accessibilityRole="button"
              accessibilityLabel={`${tileLabel(t)} を外す`}
            >
              <MiniTile code={t} w={30} h={42} />
            </Pressable>
          ))}
          {hand.length < handMax ? (
            <AddButton label="手牌に追加" onPress={() => setTarget("hand")} />
          ) : null}
        </View>

        {/* ツモ牌（何切るのみ） */}
        {kind === "discard" ? (
          <View style={styles.segRow}>
            <Text style={styles.rowLabel}>ツモ牌</Text>
            {drawn ? (
              <Pressable
                onPress={() => setDrawn(null)}
                accessibilityRole="button"
                accessibilityLabel={`ツモ牌 ${tileLabel(drawn)} を外す`}
              >
                <MiniTile code={drawn} w={30} h={42} />
              </Pressable>
            ) : (
              <AddButton label="ツモ牌を選ぶ" onPress={() => setTarget("drawn")} />
            )}
          </View>
        ) : null}

        {/* 副露 */}
        {melds.length > 0 ? (
          <View style={styles.tiles}>
            {melds.map((m, mi) => (
              <Pressable
                key={mi}
                style={styles.meldChip}
                onPress={() => setMelds((cur) => cur.filter((_, i) => i !== mi))}
                accessibilityRole="button"
                accessibilityLabel={`副露${mi + 1}を外す`}
              >
                {m.tiles.map((t, ti) => (
                  <MiniTile key={ti} code={t.tile} w={24} h={34} />
                ))}
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.meldAdd}>
          {MELD_PICKS.map(({ type, label }) => (
            <Chip
              key={type}
              label={label}
              a11ySelected={false}
              onPress={() => setTarget(`meld:${type}`)}
            />
          ))}
        </View>

        {/* 各席の河（牌タップで変更・削除・ツモ切り切替のピッカーを開く） */}
        {SEAT_ORDER.map((seat) => (
          <RiverRow
            key={seat}
            seat={seat}
            tiles={rivers[seat]}
            onEdit={(i) => setTarget(`riveredit:${seat}:${i}`)}
            onAdd={() => setTarget(`river:${seat}`)}
          />
        ))}
        {SEAT_ORDER.some((seat) => rivers[seat].length > 0) ? (
          <Text style={styles.riverHint}>河の牌はタップで変更・削除・ツモ切り切替ができます。</Text>
        ) : null}

        {/* 正解は設けない（多様な正解を前提に、回答の分布を見る）。コメントだけ書ける。 */}
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={explanation}
          multiline
          placeholder="出題者のコメント（任意。回答後に表示されます）"
          placeholderTextColor={colors.w45}
          accessibilityLabel="出題者のコメント（任意。回答後に表示されます）"
          onChangeText={setExplanation}
        />

        {err ? <Text style={styles.err}>{err}</Text> : null}
      </ScrollView>

      {/* 保存バー */}
      <View style={[styles.saveBar, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <Pressable
          style={[styles.saveGhost, busy && styles.saveOff]}
          disabled={busy}
          onPress={() => void save("draft")}
          accessibilityRole="button"
        >
          <Text style={styles.saveGhostText}>下書き保存</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, busy && styles.saveOff]}
          disabled={busy}
          onPress={() => void save("published")}
          accessibilityRole="button"
        >
          <Text style={styles.saveText}>{busy ? "保存中…" : "公開して保存"}</Text>
        </Pressable>
      </View>

      {target ? (
        <TilePickerSheet
          title={pickerTitle}
          onPick={onPick}
          onClose={() => setTarget(null)}
          // 河の牌の編集中: ツモ切り切替と削除（リーチ・鳴かれは何切るの河には無い）。
          discard={
            riverEdit && riverEditTile
              ? { riichi: false, tsumogiri: riverEditTile.tsumogiri }
              : null
          }
          onToggleTsumogiri={
            riverEdit
              ? () =>
                  setRivers((cur) =>
                    toggleDraftRiverTsumogiri(cur, riverEdit.seat, riverEdit.index),
                  )
              : undefined
          }
          canDelete={riverEdit !== null}
          onDelete={
            riverEdit
              ? () => {
                  setRivers((cur) => removeDraftRiverTile(cur, riverEdit.seat, riverEdit.index));
                  setTarget(null);
                }
              : undefined
          }
        />
      ) : null}

      {rulesOpen ? (
        <RulesSheet
          rules={rules}
          onSave={(r) => {
            setRules(r);
            setRulesOpen(false);
          }}
          onClose={() => setRulesOpen(false)}
        />
      ) : null}

      {photosOpen && token ? (
        <ProblemPhotosSheet
          refValue={
            linkedDraftId ? { draftId: linkedDraftId } : { problemId: initial!.id }
            // チップは linkedDraftId か initial.photoDraftId があるときだけ出る
          }
          token={token}
          onClose={() => setPhotosOpen(false)}
        />
      ) : null}
    </View>
  );
}

/* ---- 小物 ---- */

/** 河の行。牌タップで編集ピッカー（変更・削除・ツモ切り切替）を開く。✕ボタンは廃止。 */
function RiverRow({
  seat,
  tiles,
  onEdit,
  onAdd,
}: {
  seat: Seat;
  tiles: DraftRiverTile[];
  onEdit: (index: number) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.segRow}>
      <Text style={styles.rowLabel}>{`${seatLabel(seat)}家の河`}</Text>
      <View style={styles.tilesInRow}>
        {tiles.map((d, i) => (
          <Pressable
            key={`${d.tile}-${i}`}
            style={styles.riverChip}
            onPress={() => onEdit(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: d.tsumogiri }}
            accessibilityLabel={`${seatLabel(seat)}家の河${i + 1}（${tileLabel(d.tile)}）を変更`}
          >
            <MiniTile code={d.tile} w={26} h={36} tsumogiri={d.tsumogiri} />
          </Pressable>
        ))}
        <AddButton label={`${seatLabel(seat)}家の河に追加`} onPress={onAdd} small />
      </View>
    </View>
  );
}

/** ラベル + 牌列（タップで削除）+ 追加ボタンの行（ドラで使用）。 */
function TileRow({
  label,
  tiles,
  removeLabel,
  onRemove,
  addLabel,
  onAdd,
}: {
  label: string;
  tiles: Tile[];
  removeLabel: (tile: Tile, index: number) => string;
  onRemove: (index: number) => void;
  addLabel: string;
  onAdd?: () => void;
}) {
  return (
    <View style={styles.segRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.tilesInRow}>
        {tiles.map((t, i) => (
          <Pressable
            key={`${t}-${i}`}
            onPress={() => onRemove(i)}
            accessibilityRole="button"
            accessibilityLabel={removeLabel(t, i)}
          >
            <MiniTile code={t} w={26} h={36} />
          </Pressable>
        ))}
        {onAdd ? <AddButton label={addLabel} onPress={onAdd} small /> : null}
      </View>
    </View>
  );
}

function AddButton({
  label,
  onPress,
  small = false,
}: {
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  return (
    <Pressable
      style={[styles.add, small && styles.addSmall]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.addText}>＋</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { padding: 14, paddingBottom: 24, gap: 10 },
  input: {
    color: colors.white,
    fontSize: 14,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  inputMulti: { minHeight: 84, textAlignVertical: "top" },
  segRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { color: colors.w45, fontSize: 12, fontWeight: "700", width: 64 },
  hint: { color: colors.w45, fontSize: 11.5, lineHeight: 17 },
  /* 写真からのAI再現（有料のみ） */
  photoBox: {
    gap: 8,
    backgroundColor: colors.chrome,
    borderRadius: radius.card,
    padding: 10,
  },
  photoBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  photoBtnText: { color: colors.w70, fontSize: 12.5 },
  photoGo: {
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 9,
    alignItems: "center",
  },
  photoGoOff: { opacity: 0.6 },
  photoGoText: { color: "#1c1f1e", fontSize: 13, fontWeight: "800" },
  metaBox: {
    gap: 10,
    backgroundColor: colors.chrome,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.card,
    padding: 12,
  },
  scoreRow: { flexDirection: "row", gap: 8 },
  scoreCell: { flex: 1, gap: 3 },
  scoreLabel: { color: colors.w45, fontSize: 11, fontWeight: "700" },
  scoreInput: {
    color: colors.white,
    fontSize: 13,
    backgroundColor: colors.chrome2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  section: { color: colors.w45, fontSize: 12, fontWeight: "800", marginTop: 6 },
  prevHead: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  prevHeadText: { color: colors.w70, fontSize: 12.5, fontWeight: "800" },
  prevWrap: { alignItems: "center", marginTop: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  tilesInRow: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 5, alignItems: "center" },
  // 河チップ（タップで編集ピッカー。✕は廃止）。
  riverChip: { paddingVertical: 3 },
  riverHint: { color: colors.w45, fontSize: 11 },
  meldChip: {
    flexDirection: "row",
    gap: 2,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.base,
    backgroundColor: colors.chrome2,
  },
  meldAdd: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  add: {
    width: 30,
    height: 42,
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.w45,
    alignItems: "center",
    justifyContent: "center",
  },
  addSmall: { width: 26, height: 36 },
  addText: { color: colors.accent, fontSize: 18, fontWeight: "800" },
  err: { color: colors.danger, fontSize: 12.5 },
  saveBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.chrome,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  saveGhost: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radius.base,
    borderWidth: 1,
    borderColor: colors.line,
  },
  saveGhostText: { color: colors.w70, fontWeight: "800", fontSize: 14 },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.base,
    paddingVertical: 12,
  },
  saveOff: { opacity: 0.5 },
  saveText: { color: "#16181d", fontWeight: "800", fontSize: 14 },
});
