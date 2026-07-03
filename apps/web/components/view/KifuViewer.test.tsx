import { KifuSchema, type Kifu } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type PublicGameDetail } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { KifuViewer } from "./KifuViewer";

/** 親=東・手前=東の局を最小の指定で組む。seats は指定した席だけ上書き、その他は空。 */
function makeKifu(seats: Record<string, unknown> = {}, extra: Record<string, unknown> = {}): Kifu {
  return KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    cameraBottomSeat: "east",
    meta: { dealer: "east" },
    seats: { east: {}, south: {}, west: {}, north: {}, ...seats },
    ...extra,
  });
}

const kifu = (): Kifu => makeKifu();

/** 東家(親)の河に1枚 + 立直ロン和了を持つ局。再生末尾で和了演出が出る検証用。 */
const kifuWithAgari = (): Kifu =>
  makeKifu(
    { east: { river: [{ order: 1, tile: "1m", riichi: false, confidence: 1 }] } },
    {
      result: "ron",
      agari: [
        { winner: "east", from: "south", winTile: "3m", yaku: [{ name: "立直", han: 1 }], fu: 40 },
      ],
    },
  );

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
      status: "complete" as const,
      createdAt: "2026-06-28T00:00:00.000Z",
    })),
  };
}

function renderViewer(d: PublicGameDetail) {
  return render(
    <AuthProvider>
      <KifuViewer detail={d} gameId="g1" />
    </AuthProvider>,
  );
}

describe("KifuViewer", () => {
  it("props で受け取った公開半荘を『読み込み中』なしで描画する", () => {
    renderViewer(detail([kifu()]));
    expect(screen.getByText("公開テスト卓")).toBeTruthy();
    expect(screen.queryByText(/読み込み中/)).toBeNull();
  });

  it("局が無い半荘は空である旨を案内する", () => {
    renderViewer(detail([]));
    expect(screen.getByText(/局がありません/)).toBeTruthy();
  });

  it("局送りで表示局が切り替わる（東一局 → 東二局）", () => {
    renderViewer(detail([kifu(), kifu()]));
    const select = screen.getByLabelText("局を選択") as HTMLSelectElement;
    expect(select.value).toBe("0");
    fireEvent.click(screen.getAllByLabelText("次の局")[0]!);
    expect(select.value).toBe("1");
    fireEvent.click(screen.getAllByLabelText("前の局")[0]!);
    expect(select.value).toBe("0");
  });

  it("手牌表示トグルで相手手牌の表示状態が切り替わる", () => {
    renderViewer(detail([kifu()]));
    const toggle = screen.getByText("手牌表示");
    // 既定は表示（!hideOpp = true）。押すと非表示に切り替わる。
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("再生を末尾まで進めると和了演出（役）が現れる", () => {
    renderViewer(detail([kifuWithAgari()]));
    // 初期の全表示では和了は出さない（リロード時のポップ防止）。
    expect(screen.queryByText("立直")).toBeNull();
    // 1手戻ってから末尾へ進めると atEnd になり和了演出が出る。
    fireEvent.click(screen.getByLabelText("1手戻る"));
    fireEvent.click(screen.getByLabelText("1手進む"));
    expect(screen.getByText("立直")).toBeTruthy();
  });
});
