"use client";

import {
  analysisQuotaLabel,
  analyzeErrorMessage,
  cameraLabel,
  planCanAnalyze,
  roundNameForSeq,
  seatLabel,
  LIMIT_MESSAGES,
  MAX_SEQ,
} from "@rigel/ui";
import { SeatSchema, type CameraSeat, type Seat, type Tile } from "@rigel/schema";
import { useState } from "react";
import { analyzeAction, createEmptyKifuAction, createGameAction } from "../../app/actions";
import { buildAnalyzeForm } from "../../lib/analyze-form";
import { useAuth } from "../../lib/auth-context";
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
  onClose,
  onDone,
}: {
  /** 既存半荘に追加するなら指定。無指定なら新しい半荘を作る（手前席を選ばせる）。 */
  gameId?: string;
  bottomSeat?: Seat;
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 手動入力で焼き込む局メタ（本場/供託/ドラ）。記録のみ・点数計算はしない。
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0);
  const [dora, setDora] = useState<Tile | null>(null);
  // 作成する局（東一局=1〜北四局=16）。半荘内の好きな局を1つだけ作れる。
  const [seq, setSeq] = useState(1);

  async function onAnalyze() {
    if (!river) {
      setError("河（卓を上から1枚）の写真を選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await analyzeAction(
        buildAnalyzeForm({ river, cameraBottomSeat: seat, hands, gameId }),
      );
      if (result.ok) {
        await onDone(result.logId, result.gameId);
        return;
      }
      setError(analyzeErrorMessage(result.status, result.reason));
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy(false);
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

        {isNew && (
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
              {busy ? "解析中…" : "AI再現"}
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
