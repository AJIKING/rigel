"use client";

import { analyzeErrorMessage, cameraLabel, seatLabel } from "@rigel/ui";
import { SeatSchema, type CameraSeat, type Seat, type Tile } from "@rigel/schema";
import { useState } from "react";
import { analyzeAction, createEmptyKifuAction, createGameAction } from "../../app/actions";
import { buildAnalyzeForm } from "../../lib/analyze-form";
import { DoraPicker } from "./DoraPicker";
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
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [seat, setSeat] = useState<Seat>(bottomSeat);
  const [river, setRiver] = useState<File | null>(null);
  const [hands, setHands] = useState<Partial<Record<CameraSeat, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 手動入力で焼き込む局メタ（本場/供託/最終巡目/ドラ）。記録のみ・点数計算はしない。
  const [honba, setHonba] = useState(0);
  const [kyotaku, setKyotaku] = useState(0);
  const [junme, setJunme] = useState(1);
  const [dora, setDora] = useState<Tile | null>(null);

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
      const meta = { honba, kyotaku, junme, dora };
      const result = gameId
        ? await createEmptyKifuAction(gameId, seat, meta)
        : await createGameAction(seat, meta);
      if (result.ok) {
        await onDone(result.logId, result.gameId);
        return;
      }
      setError(
        result.status === 403 ? "非公開の保存上限に達しています。" : "作成できませんでした。",
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
        <div className={s.modalModes}>
          <button
            className={`${s.modeTab} ${mode === "ai" ? s.on : ""}`}
            onClick={() => setMode("ai")}
          >
            AI再現
          </button>
          <button
            className={`${s.modeTab} ${mode === "manual" ? s.on : ""}`}
            onClick={() => setMode("manual")}
          >
            手動入力
          </button>
        </div>

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

        {mode === "ai" ? (
          <div className={s.modalBody}>
            <label className={`${s.up} ${s.upRiver} ${river ? s.filled : ""}`}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setRiver(e.target.files?.[0] ?? null)}
              />
              <div className={s.upIn}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <circle cx="12" cy="13" r="3.2" />
                </svg>
                <span>{river ? river.name : "河（卓を上から1枚）"}</span>
              </div>
            </label>
            <div className={s.upGrid}>
              {HANDS.map(({ cam, label }) => (
                <label key={cam} className={`${s.up} ${hands[cam] ? s.filled : ""}`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) =>
                      setHands((h) => ({ ...h, [cam]: e.target.files?.[0] ?? undefined }))
                    }
                  />
                  <div className={s.upIn}>
                    <svg viewBox="0 0 24 24">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span>{hands[cam] ? `${cameraLabel(cam)}：選択済` : label}</span>
                  </div>
                </label>
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
            <Stepper label="最終巡目" unit="巡" value={junme} min={1} max={30} set={setJunme} />
            <Stepper label="本場" unit="本場" value={honba} min={0} max={19} set={setHonba} />
            <Stepper label="供託" unit="本" value={kyotaku} min={0} max={9} set={setKyotaku} />
            <div className={s.steprow}>
              <span className={s.stlabel}>ドラ</span>
              <DoraPicker value={dora} onPick={setDora} />
            </div>
            <p className={s.note}>空の盤面で局を作成します。牌は盤面の「＋」から手入力できます。</p>
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
          {mode === "ai" ? (
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
