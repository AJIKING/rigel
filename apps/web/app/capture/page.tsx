"use client";

import { SeatSchema, type Seat } from "@rigel/schema";
import { analyzeErrorMessage, cameraLabel, seatLabel } from "@rigel/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { analyze } from "../../lib/api";
import { buildAnalyzeForm } from "../../lib/analyze-form";
import { useAuth } from "../../lib/auth-context";

const CAMS = ["bottom", "right", "top", "left"] as const;

export default function CapturePage() {
  const { token, loading } = useAuth();
  const router = useRouter();
  const [seat, setSeat] = useState<Seat>("east");
  const [river, setRiver] = useState<File | null>(null);
  const [hands, setHands] = useState<Partial<Record<(typeof CAMS)[number], File>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <p style={{ color: "#aaa" }}>…</p>;
  if (!token) {
    return (
      <p style={{ color: "#555" }}>
        撮影・解析には <Link href="/login">ログイン</Link> が必要です。
      </p>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!river) {
      setError("河（卓を上から1枚）の写真を選んでください。");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const result = await analyze(
        token!,
        buildAnalyzeForm({ river, cameraBottomSeat: seat, hands }),
      );
      if (result.ok) {
        router.push(`/kifu/${result.gameId}`);
        return;
      }
      setError(analyzeErrorMessage(result.status, result.reason));
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ maxWidth: 460, display: "grid", gap: 16 }}>
      <h1>牌譜を撮る</h1>

      <label style={{ display: "grid", gap: 4 }}>
        <span>手前（カメラ手前）の席</span>
        <select
          value={seat}
          onChange={(e) => setSeat(SeatSchema.parse(e.target.value))}
          style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
        >
          {SeatSchema.options.map((s) => (
            <option key={s} value={s}>
              {seatLabel(s)}家
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: "grid", gap: 4 }}>
        <span>
          河（卓を上から1枚）<span style={{ color: "crimson" }}>*</span>
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setRiver(e.target.files?.[0] ?? null)}
        />
      </label>

      <fieldset style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
        <legend style={{ color: "#666", fontSize: 13 }}>各家の手牌（任意・各自正面から）</legend>
        <div style={{ display: "grid", gap: 8 }}>
          {CAMS.map((cam) => (
            <label key={cam} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 48, color: "#555", fontSize: 13 }}>{cameraLabel(cam)}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) =>
                  setHands((h) => ({ ...h, [cam]: e.target.files?.[0] ?? undefined }))
                }
              />
            </label>
          ))}
        </div>
      </fieldset>

      {error && (
        <p role="alert" style={{ color: "crimson", fontSize: 14 }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !river}
        style={{
          padding: "12px 16px",
          borderRadius: 8,
          border: "none",
          background: submitting || !river ? "#999" : "#222",
          color: "#fff",
          fontSize: 15,
          cursor: submitting || !river ? "default" : "pointer",
        }}
      >
        {submitting ? "解析中…（少し時間がかかります）" : "解析して保存"}
      </button>
    </form>
  );
}
