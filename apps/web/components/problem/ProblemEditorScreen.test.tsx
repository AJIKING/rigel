import { ProblemSchema, type Problem } from "@rigel/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { makeDiscardPost, stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  createProblemAction: vi.fn(),
  updateProblemAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ProblemEditorScreen } from "./ProblemEditorScreen";

function renderEditor(initial?: ProblemPost) {
  return render(
    <AuthProvider>
      <ProblemEditorScreen initial={initial} />
    </AuthProvider>,
  );
}

/** 牌グリッド（ピッカー）から牌を1枚タップする。 */
function pick(tile: string) {
  const grid = screen.getByRole("group", { name: "牌を選ぶ" });
  fireEvent.click(within(grid).getByRole("button", { name: tile }));
}

const TILE_LABELS = [
  "1萬",
  "2萬",
  "3萬",
  "4萬",
  "5萬",
  "6萬",
  "7萬",
  "8萬",
  "9萬",
  "1筒",
  "2筒",
  "3筒",
  "4筒",
];

beforeEach(() => {
  push.mockReset();
  h.createProblemAction.mockReset().mockResolvedValue({ ok: true, problemId: "p1" });
  h.updateProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemEditorScreen: 何切るの作成", () => {
  it("手牌13枚＋ツモ＋答えを入れて公開保存できる", async () => {
    stubMe("free");
    renderEditor();

    // 手牌へ13枚（ピッカーは連続タップ）。萬子9枚＋筒子4枚。
    await screen.findByRole("group", { name: "牌を選ぶ" });
    for (const label of TILE_LABELS.slice(0, 9)) pick(label);
    fireEvent.click(screen.getByRole("button", { name: "筒" })); // スートタブ
    for (const label of TILE_LABELS.slice(9)) pick(label);

    // ツモ牌へ切替 → 5筒。
    fireEvent.click(screen.getByRole("button", { name: "ツモ牌" }));
    pick("5筒");

    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "テスト問題" } });
    fireEvent.change(screen.getByLabelText(/出題者のコメント/), {
      target: { value: "解説文" },
    });

    fireEvent.click(screen.getByRole("button", { name: "公開して保存" }));
    await waitFor(() => expect(h.createProblemAction).toHaveBeenCalled());
    const [input] = h.createProblemAction.mock.calls[0] as [
      { title: string; problem: Problem; status?: string },
    ];
    expect(input.title).toBe("テスト問題");
    expect(input.status).toBe("published");
    expect(input.problem.kind).toBe("discard");
    expect(input.problem.drawn).toBe("5p");
    // 正解は設けない（多様な正解を前提）。answer フィールドは持たない。
    expect("answer" in input.problem).toBe(false);
    expect(input.problem.explanation).toBe("解説文");
    expect(() => ProblemSchema.parse(input.problem)).not.toThrow();
    expect(push).toHaveBeenCalledWith("/mypage/problems");
  });

  it("手牌が13枚未満だと保存できずエラー文言を出す", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    pick("1萬"); // 1枚だけ
    fireEvent.click(screen.getByRole("button", { name: "ツモ牌" }));
    fireEvent.click(screen.getByRole("button", { name: "筒" })); // スートタブ
    pick("5筒");
    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    expect(await screen.findByText(/13枚/)).toBeTruthy();
    expect(h.createProblemAction).not.toHaveBeenCalled();
  });

  it("上限(403)は共通文言を出す", async () => {
    stubMe("free");
    h.createProblemAction.mockResolvedValue({ ok: false, status: 403 });
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    for (const label of TILE_LABELS.slice(0, 9)) pick(label);
    fireEvent.click(screen.getByRole("button", { name: "筒" }));
    for (const label of TILE_LABELS.slice(9)) pick(label);
    fireEvent.click(screen.getByRole("button", { name: "ツモ牌" }));
    pick("5筒");
    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    expect(await screen.findByText(/20問まで/)).toBeTruthy();
  });
});

describe("ProblemEditorScreen: 相手の手牌（出題オプション）", () => {
  it("既定はOFF（他家の手牌の入力先が出ない）。ONにすると入力先が現れ、牌を置ける", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    expect(screen.queryByRole("button", { name: "南家の手牌" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "相手の手牌も設定する" }));
    fireEvent.click(screen.getByRole("button", { name: "南家の手牌" }));
    pick("1萬");
    // 入力済み行に南家の手牌が出る（タップで外せるチップ）。
    expect(screen.getByRole("button", { name: "南家の手牌の 1萬 を外す" })).toBeTruthy();
  });

  it("OFFに戻すと他家の手牌はクリアされる", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "相手の手牌も設定する" }));
    fireEvent.click(screen.getByRole("button", { name: "南家の手牌" }));
    pick("1萬");
    fireEvent.click(screen.getByRole("button", { name: "相手の手牌も設定する" })); // OFF
    expect(screen.queryByRole("button", { name: "南家の手牌の 1萬 を外す" })).toBeNull();
    expect(screen.queryByRole("button", { name: "南家の手牌" })).toBeNull();
  });
});

describe("ProblemEditorScreen: 既存問題の編集", () => {
  it("初期値を読み込み、更新は updateProblemAction を呼ぶ", async () => {
    stubMe("free");
    const initial: ProblemPost = makeDiscardPost({
      id: "p9",
      userId: "u1",
      title: "既存問題",
      status: "draft",
    });
    renderEditor(initial);
    expect((await screen.findByLabelText("タイトル")) as HTMLInputElement).toHaveProperty(
      "value",
      "既存問題",
    );
    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    await waitFor(() => expect(h.updateProblemAction).toHaveBeenCalled());
    const [id, input] = h.updateProblemAction.mock.calls[0] as [
      string,
      { problem: Problem; status?: string },
    ];
    expect(id).toBe("p9");
    expect(input.status).toBe("draft");
  });
});
