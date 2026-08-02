import { KifuSchema, ProblemSchema, type Problem } from "@rigel/schema";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { makeDiscardPost, stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  createProblemAction: vi.fn(),
  updateProblemAction: vi.fn(),
  analyzeProblemAction: vi.fn(),
  getProblemAnalysisJobAction: vi.fn(),
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
  h.analyzeProblemAction.mockReset();
  h.getProblemAnalysisJobAction.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** 手牌13枚（萬9+筒4）をピッカーの連続タップで入れる。 */
function fillHand() {
  for (const label of TILE_LABELS.slice(0, 9)) pick(label);
  fireEvent.click(screen.getByRole("button", { name: "筒" })); // スートタブ
  for (const label of TILE_LABELS.slice(9)) pick(label);
}

describe("ProblemEditorScreen: 写真から作成（AI再現）", () => {
  const aiKifu = () =>
    KifuSchema.parse({
      schemaVersion: "1.0.0",
      capturedAt: "2026-07-14T00:00:00.000Z",
      cameraBottomSeat: "east",
      seats: {
        east: {
          hand: [
            { tile: "1m" },
            { tile: "2m" },
            { tile: null }, // 読めなかった牌は持ち込まれない
          ],
        },
        south: { river: [{ order: 1, tile: "9s" }] },
        west: {},
        north: {},
      },
      meta: { dora: ["3z"], junme: 7 },
      readingNotes: "グレアで1枚読めず",
    });

  it("解析結果（AIドラフト）がエディタへ流し込まれ、読み取りメモが表示される", async () => {
    stubMe("pro", { remainingCalls: 300, monthlyCallQuota: 320 });
    // 非同期ジョブ（202 + ポーリング。async-analysis.md Task 8）: done で結果ドラフト同梱。
    h.analyzeProblemAction.mockResolvedValue({ ok: true, jobId: "job-1" });
    h.getProblemAnalysisJobAction.mockResolvedValue({
      id: "job-1",
      status: "done",
      reason: null,
      draft: aiKifu(),
    });
    renderEditor();

    fireEvent.click(await screen.findByRole("button", { name: /写真から作成/ }));
    const dialog = screen.getByRole("dialog", { name: "写真から作成" });
    // 残枠は撮る前に見せる（送信後の枠切れで手間を無駄にしない）。
    expect(within(dialog).getByText("解析枠 残り 300 / 320（今月）")).toBeTruthy();
    const handInput = within(dialog).getByLabelText(/自分の手牌/) as HTMLInputElement;
    fireEvent.change(handInput, {
      target: { files: [new File(["x"], "hand.jpg", { type: "image/jpeg" })] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "AI再現" }));

    await waitFor(() => expect(h.analyzeProblemAction).toHaveBeenCalled());
    // 手牌・河・ドラが流し込まれる（null 牌は落ちる）。
    expect(await screen.findByRole("button", { name: "1萬 を外す" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2萬 を外す" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "南家の河1（9索）を変更" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ドラ表示牌 西 を外す" })).toBeTruthy();
    // 読み取りメモと「全牌目検してから保存」の促しを表示する（confidence 廃止・[決定] 2026-07-24）。
    expect(screen.getByText(/グレアで1枚読めず/)).toBeTruthy();
    expect(screen.getByText(/目で確認してから保存/)).toBeTruthy();
  });

  it("free プランには「写真から作成」を出さない（解析枠0＝kifu と同方針）", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    expect(screen.queryByRole("button", { name: /写真から作成/ })).toBeNull();
  });
});

describe("ProblemEditorScreen: 何切るの作成", () => {
  it("手牌13枚＋ツモ＋答えを入れて公開保存できる", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fillHand();

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

  it("手牌が13枚に達すると入力先が自動でツモ牌に切り替わる（切替忘れでツモ未設定にならない）", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fillHand();
    // 13枚目を置いた時点で入力先は「ツモ牌」へ。チップを押さずにそのまま置ける。
    expect(
      (screen.getByRole("button", { name: "ツモ牌" }) as HTMLButtonElement).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    pick("5筒");
    // 入力済みの「ツモ牌」行に表示され、タップで外せる。
    expect(screen.getByRole("button", { name: "ツモ牌の 5筒 を外す" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    await waitFor(() => expect(h.createProblemAction).toHaveBeenCalled());
    const [input] = h.createProblemAction.mock.calls[0] as [{ problem: Problem }];
    expect(input.problem.drawn).toBe("5p");
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
    fillHand();
    fireEvent.click(screen.getByRole("button", { name: "ツモ牌" }));
    pick("5筒");
    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    expect(await screen.findByText(/20問まで/)).toBeTruthy();
  });
});

describe("ProblemEditorScreen: 袋小路（無反応・解決不能なエラー）を作らない", () => {
  const pressed = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).getAttribute("aria-pressed");

  it("自分の席を対象席と同じにしたら、対象席は自動で別の席に補正される", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "鳴き判断" }));
    // 既定: 自分=東・対象=南。自分の席を南にすると対象席は自動で有効な別の席になる
    // （南のまま／空値のまま残さない）。
    fireEvent.change(screen.getByLabelText("自分の席"), { target: { value: "south" } });
    expect(["east", "west", "north"]).toContain(
      (screen.getByLabelText("対象席") as HTMLSelectElement).value,
    );
  });

  it("出題形式を鳴き判断に切り替えたら、入力先がツモ牌のまま残らない", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fillHand(); // 13枚で入力先は自動でツモ牌へ
    fireEvent.click(screen.getByRole("button", { name: "鳴き判断" }));
    // ツモ牌チップは消え、入力先は手牌に戻る（見えない入力先に置かせない）。
    expect(screen.queryByRole("button", { name: "ツモ牌" })).toBeNull();
    expect(pressed("手牌（13/13）")).toBe("true");
  });

  it("手牌を外したら入力先は手牌に戻る（ツモ牌を誤って置き換えない）", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fillHand(); // 入力先は自動でツモ牌へ
    fireEvent.click(screen.getByRole("button", { name: "1萬 を外す" }));
    expect(pressed("手牌（12/13）")).toBe("true");
  });

  it("ドラは5枚で上限。超えて置こうとしたら黙殺せず文言で知らせる", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "ドラ表示牌" }));
    for (const label of TILE_LABELS.slice(0, 6)) pick(label); // 6枚目は入らない
    expect(await screen.findByText(/ドラ表示牌は5枚まで/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "ドラ表示牌 6萬 を外す" })).toBeNull();
  });

  it("鳴き判断で手牌が13枚のとき、さらに置こうとしたら黙殺せず文言で知らせる", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "鳴き判断" }));
    fillHand();
    pick("9筒"); // 14枚目（鳴き判断はツモ牌への自動切替が無い）
    expect(await screen.findByText(/手牌は13枚まで/)).toBeTruthy();
  });
});

describe("ProblemEditorScreen: 河の牌の編集（タップで変更・削除・ツモ切り）", () => {
  it("河チップのタップで編集モードになり、ツモ切り切替が保存 problem の river に乗る", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fillHand(); // 13枚 → 入力先は自動でツモ牌へ
    pick("5筒"); // ツモ牌

    // 東家の河に 1筒 を置く（既定は手出し）。
    fireEvent.click(screen.getByRole("button", { name: "東家の河" }));
    pick("1筒");

    // チップタップで編集モード → ツモ切り切替。
    fireEvent.click(screen.getByRole("button", { name: "東家の河1（1筒）を変更" }));
    fireEvent.click(screen.getByRole("button", { name: "ツモ切りにする" }));

    fireEvent.click(screen.getByRole("button", { name: "下書き保存" }));
    await waitFor(() => expect(h.createProblemAction).toHaveBeenCalled());
    const [input] = h.createProblemAction.mock.calls[0] as [{ problem: Problem }];
    expect(input.problem.seats.east.river.map((d) => d.tsumogiri)).toEqual([true]);
  });

  it("河チップのタップ→牌グリッドで別の牌に変更できる", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "東家の河" }));
    pick("1萬");

    fireEvent.click(screen.getByRole("button", { name: "東家の河1（1萬）を変更" }));
    pick("9萬");
    expect(screen.getByRole("button", { name: "東家の河1（9萬）を変更" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "東家の河1（1萬）を変更" })).toBeNull();
  });

  it("河チップのタップ→「削除」で外せる（チップの✕は廃止）", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    fireEvent.click(screen.getByRole("button", { name: "東家の河" }));
    pick("1萬");

    expect(screen.queryByRole("button", { name: "東家の河の 1萬 を外す" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "東家の河1（1萬）を変更" }));
    fireEvent.click(screen.getByRole("button", { name: "河の牌を削除" }));
    expect(screen.queryByRole("button", { name: "東家の河1（1萬）を変更" })).toBeNull();
  });
});

describe("ProblemEditorScreen: プレビューのネームプレート", () => {
  it("絶対席＋（親）で出る（親を変えても自分の席とずれない）", async () => {
    stubMe("free");
    renderEditor();
    await screen.findByRole("group", { name: "牌を選ぶ" });
    // 親を南へ。自分の席は既定=東のまま。
    fireEvent.change(screen.getByLabelText("親"), { target: { value: "south" } });
    // 風表記（親基準）なら「南家」（=西の風）が出るはず。絶対席なら 南家（親） になる。
    expect(screen.getByText("南家（親）")).toBeTruthy();
    expect(screen.queryByText("南家")).toBeNull();
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
