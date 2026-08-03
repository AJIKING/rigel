"use client";

import {
  analysisJobFailureMessage,
  analysisQuotaLabel,
  analysisTimeoutMessage,
  analyzeErrorMessage,
  cameraLabel,
  planCanAnalyze,
  roundNameForSeq,
  seatLabel,
  ANALYSIS_BUSY_MESSAGE,
  LIMIT_MESSAGES,
  MAX_SEQ,
} from "@rigel/ui";
import { SeatSchema, type CameraSeat, type Seat, type Tile } from "@rigel/schema";
import { useEffect, useRef, useState } from "react";
import {
  analyzeAction,
  createEmptyKifuAction,
  createGameAction,
  getAnalysisJobAction,
} from "../../app/actions";
import { buildAnalyzeForm } from "../../lib/analyze-form";
import { useAuth } from "../../lib/auth-context";
import { useAnalysisJob } from "../../lib/use-analysis-job";
import { DoraPicker } from "./DoraPicker";
import { PhotoField } from "./PhotoField";
import { Stepper } from "./Stepper";
import s from "./board-editor.module.css";

const HANDS: { cam: CameraSeat; label: string }[] = [
  { cam: "bottom", label: "あなたの手牌" },
  { cam: "right", label: "下家の手牌" },
  { cam: "top", label: "対面の手牌" },
  { cam: "left", label: "上家の手牌" },
];

/** 局の追加モーダル。AI再現=撮影画像を /analyze、手動=空の局を作成（牌は盤面で手入力）。
 *  gameId 無し=新しい半荘の最初の局（手前席を選ばせ、成功で gameId/logId を返す）。 */
export function AddKyokuModal({
  gameId,
  bottomSeat = "east",
  askSeat = false,
  onClose,
  onDone,
}: {
  /** 既存半荘に追加するなら指定。無指定なら新しい半荘を作る（手前席を選ばせる）。 */
  gameId?: string;
  bottomSeat?: Seat;
  /** 既存半荘でも手前席を選ばせる（0局＝参照できる局が無いとき。Phase C）。 */
  askSeat?: boolean;
  onClose: () => void;
  onDone: (newLogId: string, gameId: string) => void | Promise<void>;
}) {
  const isNew = !gameId;
  const { user } = useAuth();
  // 写真からのAI再現は有料プランのみ（free は解析枠0）。フリーには写真入力を出さない
  //（mobile の Capture と同一方針。実際の枠判定は API 側でも行う）。
  const canAnalyze = planCanAnalyze(user?.plan ?? "free");
  // 残枠は撮る前に見せる（送信後の 403 で知るのでは撮影の手間が無駄になる。mobile Capture と同方針）。
  const quotaLabel = analysisQuotaLabel(user?.remainingCalls, user?.monthlyCallQuota);
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const effMode = canAnalyze ? mode : "manual";
  const [seat, setSeat] = useState<Seat>(bottomSeat);
  const [river, setRiver] = useState<File | null>(null);
  const [hands, setHands] = useState<Partial<Record<CameraSeat, File>>>({});
  // 1枚モード（[決定] 2026-08-02 四家対応・文言は「手牌を含む」。mobile Capture と同一）。
  const [handFromRiver, setHandFromRiver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 手動入力で焼き込む局メタ（本場/供託/ドラ）。記録のみ・点数計算はしない。
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0);
  const [dora, setDora] = useState<Tile | null>(null);
  // 作成する局（東一局=1〜北四局=16）。半荘内の好きな局を1つだけ作れる。
  const [seq, setSeq] = useState(1);
  // 解析の追従は Provider に一本化（202 で即 start）。以前はモーダル内で自前ポーリングし
  // 閉じたときだけ引き継いでいたが、その間 Provider の busy が立たず「ひとつずつ」ガードに
  // 穴があった（品質パス 2026-08-03）。モーダルは settledCount を購読して完了/失敗を拾う。
  const { settledCount, busy: analysisBusy, start: startTracking } = useAnalysisJob();
  const alive = useRef(true);
  const pendingJobId = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // ジョブの終端（settledCount の変化）: モーダルが生きていれば結果を1回だけ取り直して
  // onDone / 失敗文言に振り分ける（閉じた後は一覧側の refetch が拾う）。
  const settledSeen = useRef(settledCount);
  useEffect(() => {
    if (settledCount === settledSeen.current) return;
    settledSeen.current = settledCount;
    const jobId = pendingJobId.current;
    if (!jobId) return;
    pendingJobId.current = null;
    void (async () => {
      const job = await getAnalysisJobAction(jobId).catch(() => undefined);
      if (!alive.current) return;
      setBusy(false);
      if (job && job.status === "done" && job.gameId && job.logId) {
        await onDone(job.logId, job.gameId);
        return;
      }
      if (job && job.status === "failed") {
        setError(analysisJobFailureMessage(job.reason));
        return;
      }
      // タイムアウト等（ジョブ自体はサーバー側で進んでいる）。
      setError(`解析に時間がかかっています。${analysisTimeoutMessage()}`);
    })();
    // onDone は親から毎レンダー渡り得るが、発火条件は settledCount の変化だけ。
    // eslint の exhaustive-deps は未導入（依存固定台帳参照）。
  }, [settledCount, onDone]);

  async function onAnalyze() {
    if (!river) {
      setError("河（卓を上から1枚）の写真を選んでください。");
      return;
    }
    // 解析はひとつずつ（202 の後に断るとサーバー側では課金・キュー投入が済んでいるため、
    // 送信前に見る。mobile Capture と同じ規律）。
    if (analysisBusy) {
      setError(ANALYSIS_BUSY_MESSAGE);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // 解析は非同期ジョブ（202 + jobId → Provider がポーリング。docs/plans/async-analysis.md）。
      const result = await analyzeAction(
        buildAnalyzeForm({ river, cameraBottomSeat: seat, hands, gameId, handFromRiver }),
      );
      if (!result.ok) {
        setError(analyzeErrorMessage(result.status, result.reason));
        setBusy(false);
        return;
      }
      const started = startTracking({ jobId: result.jobId, startedAt: Date.now() });
      if (!started) {
        // まれな競合（直前に別タブが開始）。ジョブ自体は進み、一覧の解析中カードが拾う。
        setError(ANALYSIS_BUSY_MESSAGE);
        setBusy(false);
        return;
      }
      pendingJobId.current = result.jobId;
      // busy は終端（settled）まで維持＝ボタンは「解析中」のまま。
    } catch {
      if (alive.current) {
        setError("通信に失敗しました。");
        setBusy(false);
      }
    }
  }

  async function onManualCreate() {
    setBusy(true);
    setError(null);
    try {
      // ドラは複数枚スキーマ（作成時は1枚だけ選べる。追加はエディタで）。
      const meta = { honba, kyotaku, dora: dora ? [dora] : [] };
      const result = gameId
        ? await createEmptyKifuAction(gameId, seat, meta, seq)
        : await createGameAction(seat, meta, seq);
      if (result.ok) {
        await onDone(result.logId, result.gameId);
        return;
      }
      setError(
        result.status === 409
          ? LIMIT_MESSAGES.gameFull
          : result.status === 403
            ? LIMIT_MESSAGES.draftGames
            : "作成できませんでした。",
      );
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.modalOv} onClick={onClose}>
      <div
        className={s.modal}
        role="dialog"
        aria-label="局を追加"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.modalHead}>
          <div className={s.modalTitle}>局を追加</div>
          <button className={s.modalX} aria-label="閉じる" onClick={onClose}>
            ✕
          </button>
        </div>
        {canAnalyze && (
          <div className={s.modalModes}>
            <button
              className={`${s.modeTab} ${effMode === "ai" ? s.on : ""}`}
              onClick={() => setMode("ai")}
            >
              AI再現
            </button>
            <button
              className={`${s.modeTab} ${effMode === "manual" ? s.on : ""}`}
              onClick={() => setMode("manual")}
            >
              手動入力
            </button>
          </div>
        )}

        {(isNew || askSeat) && (
          <div className={s.modalSeat}>
            <span className={s.meLabel}>手前の席</span>
            <div className={s.meSeg}>
              {SeatSchema.options.map((sv) => (
                <button
                  key={sv}
                  className={seat === sv ? s.on : ""}
                  onClick={() => setSeat(sv)}
                  type="button"
                >
                  {seatLabel(sv)}
                </button>
              ))}
            </div>
          </div>
        )}

        {effMode === "ai" ? (
          <div className={s.modalBody}>
            {quotaLabel && <p className={s.note}>{quotaLabel}</p>}
            <PhotoField wide label="河（卓を上から1枚）" file={river} onChange={setRiver} />
            {/* 1枚モードのトグル（河の直下。mobile Capture と同一文言）。
                ON では個別の手牌写真は不要（二重指定の混乱を防ぐため明示選択も破棄）。 */}
            <label className={s.oneTgl}>
              <input
                type="checkbox"
                aria-label="手牌を含む"
                checked={handFromRiver}
                onChange={(e) => {
                  setHandFromRiver(e.target.checked);
                  setHands({});
                }}
              />
              <span>
                <strong>手牌を含む</strong>
                <small>
                  写真に写っている各家の手牌もこの1枚から読み取ります（解析回数を最大4回分多く使います）
                </small>
              </span>
            </label>
            {!handFromRiver && (
              <div className={s.upGrid}>
                {HANDS.map(({ cam, label }) => (
                  <PhotoField
                    key={cam}
                    icon="plus"
                    label={label}
                    file={hands[cam] ?? null}
                    selectedLabel={`${cameraLabel(cam)}：選択済`}
                    onChange={(f) => setHands((h) => ({ ...h, [cam]: f ?? undefined }))}
                  />
                ))}
              </div>
            )}
            {/* 閉じてもジョブは進み Provider が引き継ぐ（Phase B）。待たされる不安を下げる注記。 */}
            {busy && (
              <p className={s.note}>閉じても解析は続きます（完了すると一覧に反映されます）。</p>
            )}
            {error && (
              <p className={s.note} style={{ color: "var(--vermilion)" }}>
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className={s.modalBody}>
            {/* 作成する局。半荘内の好きな局を1つだけ作れる（順番に縛られない）。 */}
            <div className={s.steprow}>
              <span className={s.stlabel}>作成する局</span>
              {/* セレクトの意匠は結果セレクト等と共通（.agsel/.sel2）。素の select を使わない。 */}
              <div className={s.agsel}>
                <select
                  className={s.sel2}
                  aria-label="作成する局"
                  value={seq}
                  onChange={(e) => setSeq(Number(e.target.value))}
                >
                  {Array.from({ length: MAX_SEQ }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {roundNameForSeq(n)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <Stepper label="本場" unit="本場" value={honba} min={0} max={19} set={setHonba} />
            <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} set={setKyotaku} />
            <div className={s.steprow}>
              <span className={s.stlabel}>ドラ表示牌</span>
              <DoraPicker value={dora} onPick={setDora} />
            </div>
            <p className={s.note}>空の盤面で局を作成します。牌は盤面の「＋」から手入力できます。</p>
            {/* free にはアップセル文言だけ出す（mobile と同一文言）。 */}
            {!canAnalyze && (
              <p className={s.note}>
                写真からのAI再現（撮影→自動で牌譜化）は有料プラン（Next / Pro）で利用できます。
              </p>
            )}
            {error && (
              <p className={s.note} style={{ color: "var(--vermilion)" }}>
                {error}
              </p>
            )}
          </div>
        )}

        <div className={s.modalFoot}>
          <button className={s.btnGhost} onClick={onClose}>
            キャンセル
          </button>
          {effMode === "ai" ? (
            <button className={s.btnPrimary} disabled={busy} onClick={() => void onAnalyze()}>
              {busy && <span className={s.spinner} />}
              {busy ? "解析中" : "AI再現"}
            </button>
          ) : (
            <button className={s.btnPrimary} disabled={busy} onClick={() => void onManualCreate()}>
              {busy && <span className={s.spinner} />}
              {busy ? "作成中…" : "手動作成"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
