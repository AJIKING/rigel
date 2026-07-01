import { KifuSchema, type Kifu } from "@rigel/schema";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type PublicGameDetail } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { KifuViewer } from "./KifuViewer";

function kifu(): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "east" },
  });
}

function detail(logs: Kifu[]): PublicGameDetail {
  return {
    game: { id: "g1", title: "公開テスト卓", createdAt: "2026-06-28T00:00:00.000Z" },
    owner: { id: "u1", handle: "taro", displayName: "太郎" },
    logs: logs.map((k, i) => ({
      id: `l${i + 1}`,
      userId: "u1",
      gameId: "g1",
      seq: i + 1,
      kifu: k,
      visibility: "public" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

describe("KifuViewer", () => {
  it("props で受け取った公開半荘を『読み込み中』なしで描画する", () => {
    render(
      <AuthProvider>
        <KifuViewer detail={detail([kifu()])} gameId="g1" />
      </AuthProvider>,
    );
    expect(screen.getByText("公開テスト卓")).toBeTruthy();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("局が無い半荘は空である旨を案内する", () => {
    render(
      <AuthProvider>
        <KifuViewer detail={detail([])} gameId="g1" />
      </AuthProvider>,
    );
    expect(screen.getByText(/局がありません/)).toBeTruthy();
  });
});
