"use client";

import { visibilityLabel } from "@rigel/ui";
import { useState } from "react";
import { setVisibility } from "../lib/api";
import { useAuth } from "../lib/auth-context";

type Visibility = "public" | "private";

/** 所有者だけに見せる公開範囲の切り替え。private 化が上限超過なら 403 を案内。 */
export function VisibilityToggle({
  logId,
  ownerId,
  initial,
}: {
  logId: string;
  ownerId: string;
  initial: Visibility;
}) {
  const { user, token } = useAuth();
  const [vis, setVis] = useState<Visibility>(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 所有者以外には出さない（最終的な許可は API 側で担保）。
  if (!token || user?.id !== ownerId) return null;

  async function toggle() {
    const next: Visibility = vis === "public" ? "private" : "public";
    setBusy(true);
    setNote(null);
    try {
      const res = await setVisibility(token!, logId, next);
      if (res.ok) setVis(next);
      else
        setNote(res.status === 403 ? "非公開の保存上限に達しています。" : "変更できませんでした。");
    } catch {
      setNote("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ color: "#555" }}>
        公開範囲: <strong>{visibilityLabel(vis)}</strong>
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        style={{
          padding: "2px 8px",
          borderRadius: 6,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: busy ? "default" : "pointer",
          fontSize: 13,
        }}
      >
        {busy ? "…" : vis === "public" ? "非公開にする" : "公開にする"}
      </button>
      {note && <span style={{ color: "#a60", fontSize: 12 }}>{note}</span>}
    </span>
  );
}
