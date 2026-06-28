"use client";

import type { Kifu } from "@rigel/schema";
import {
  applyTileEdit,
  collectReviewItems,
  seatLabel,
  tileLabel,
  type ReviewItem,
  type TileArea,
} from "@rigel/ui";
import { useMemo, useState } from "react";
import { updateKifu } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { KifuBoard } from "./KifuBoard";
import { TilePicker } from "./TilePicker";

const AREA_LABEL: Record<TileArea, string> = { hand: "手牌", river: "河", meld: "鳴き" };
type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * 牌譜の閲覧＋修正画面。盤面を表示し、「要確認」な牌を一覧から選んで正しい牌に直す。
 * 修正ロジックは @rigel/ui の純粋関数（collectReviewItems / applyTileEdit）に委譲。
 */
export function KifuEditor({ initialKifu, kifuId }: { initialKifu: Kifu; kifuId?: string }) {
  const { token } = useAuth();
  const [kifu, setKifu] = useState<Kifu>(initialKifu);
  const [editing, setEditing] = useState<ReviewItem | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const reviews = useMemo(() => collectReviewItems(kifu), [kifu]);

  const canSave = Boolean(token && kifuId);

  async function onSave() {
    if (!token || !kifuId) return;
    setSave("saving");
    try {
      const res = await updateKifu(token, kifuId, kifu);
      setSave(res.ok ? "saved" : "error");
    } catch {
      setSave("error");
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || save === "saving"}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: !canSave || save === "saving" ? "#999" : "#222",
            color: "#fff",
            cursor: !canSave || save === "saving" ? "default" : "pointer",
            fontSize: 14,
          }}
        >
          {save === "saving" ? "保存中…" : "修正を保存"}
        </button>
        {!canSave && (
          <span style={{ color: "#888", fontSize: 13 }}>ログインすると保存できます</span>
        )}
        {save === "saved" && <span style={{ color: "#1b7a2f", fontSize: 13 }}>保存しました</span>}
        {save === "error" && (
          <span style={{ color: "crimson", fontSize: 13 }}>保存に失敗しました</span>
        )}
      </div>

      <KifuBoard kifu={kifu} />

      <section
        data-testid="review-panel"
        style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}
      >
        <h2 style={{ fontSize: 15, margin: "0 0 8px" }}>要確認 {reviews.length}件</h2>
        {reviews.length === 0 ? (
          <p style={{ color: "#1b7a2f", margin: 0 }}>すべて確認済みです 🎉</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {reviews.map((item, i) => (
              <li key={`${item.location.seat}-${item.location.area}-${item.location.index}-${i}`}>
                <button
                  type="button"
                  data-testid="review-item"
                  onClick={() => setEditing(item)}
                  style={{
                    border: "1px solid #f0c0c8",
                    background: "#fff7f8",
                    borderRadius: 6,
                    padding: "6px 10px",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {seatLabel(item.location.seat)}家 / {AREA_LABEL[item.location.area]} / 現在:{" "}
                  {tileLabel(item.read.tile)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <div
          role="dialog"
          aria-label="牌の修正"
          style={{ border: "2px solid #ddd", borderRadius: 8, padding: 12, background: "#fafafa" }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
            正しい牌を選んでください（{seatLabel(editing.location.seat)}家 /{" "}
            {AREA_LABEL[editing.location.area]}）
          </p>
          <TilePicker
            onPick={(tile) => {
              setKifu((k) => applyTileEdit(k, editing.location, tile));
              setEditing(null);
              setSave("idle");
            }}
          />
          <button
            type="button"
            onClick={() => setEditing(null)}
            style={{ marginTop: 8, fontSize: 13 }}
          >
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
}
