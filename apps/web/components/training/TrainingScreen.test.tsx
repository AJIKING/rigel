import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({
  startQuizSessionAction: vi.fn(),
  finishQuizSessionAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TrainingScreen } from "./TrainingScreen";

// GA4 の gtag をスタブ（trackEvent は window.gtag 経由。未定義なら何もしない）。
const gtag = vi.fn();

function renderScreen(seed?: number) {
  return render(
    <AuthProvider>
      <TrainingScreen seed={seed} />
    </AuthProvider>,
  );
}

/** マイクロタスク（/api/me・Server Action の解決）と 0ms タイマーを流す。 */
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** フェイクタイマーを ms ぶん進める（カウントダウン・正誤表示の 0.5 秒送り）。 */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  h.startQuizSessionAction.mockReset().mockResolvedValue({
    ok: true,
    id: "qs1",
    remainingToday: 2,
  });
  h.finishQuizSessionAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  gtag.mockReset();
  (window as unknown as { gtag?: typeof gtag }).gtag = gtag;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete (window as unknown as { gtag?: typeof gtag }).gtag;
});

describe("TrainingScreen: 種目選択", () => {
  it("未ログインはログイン導線を出し、種目カードは出さない", async () => {
    stubMe(null);
    renderScreen();
    await flush();
    const note = screen.getByText(/特訓するには/);
    expect(within(note).getByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /清一色 多面待ち/ })).toBeNull();
  });

  it("ログイン中（free）: 2種目のカード＋説明＋無料枠の注記（1日3回）が出る", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /牌効率（受け入れ最大）/ })).toBeTruthy();
    expect(screen.getByText(/待ち牌を全部選ぶ/)).toBeTruthy();
    expect(screen.getByText(/受け入れ枚数が最大になる牌を切る/)).toBeTruthy();
    expect(screen.getByText("無料プランは1日3回まで（有料プランは無制限）")).toBeTruthy();
  });

  it("有料プラン（next）には無料枠の注記を出さない", async () => {
    stubMe("next");
    renderScreen();
    await flush();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.queryByText(/無料プランは1日3回まで/)).toBeNull();
  });
});

describe("TrainingScreen: セッション開始", () => {
  it("カードをタップすると startQuizSessionAction(kind) が呼ばれ、問題（牌）と60秒・スコア・残り回数が表示され quiz_start が送られる", async () => {
    stubMe("free");
    renderScreen(1); // seed=1 の清一色 Q1 = 筒子13枚・待ち 4p/5p/6p（決定的生成）
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(h.startQuizSessionAction).toHaveBeenCalledWith("chinitsu");
    // 出題: 待ち牌の候補ボタン（その色の1〜9）が出る。
    expect(screen.getByRole("button", { name: "1筒" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "9筒" })).toBeTruthy();
    // ヘッダ: スコア・残り秒（60秒）・free の残り回数（開始応答ベース）。
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.getByText("今日あと2回")).toBeTruthy();
    // 計測: quiz_start（params は kind のみ＝成績を送らない）。
    expect(gtag).toHaveBeenCalledWith("event", "quiz_start", { kind: "chinitsu" });
  });

  it("有料（remainingToday=null）は残り回数を表示しない", async () => {
    stubMe("next");
    h.startQuizSessionAction.mockResolvedValue({ ok: true, id: "qs1", remainingToday: null });
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    expect(h.startQuizSessionAction).toHaveBeenCalledWith("efficiency");
    expect(screen.queryByText(/今日あと/)).toBeNull();
  });

  it("402（無料枠の使い切り）は上限メッセージを出し、セッションは始まらない", async () => {
    stubMe("free");
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(
      screen.getByText("本日の無料回数（3回）を使い切りました。有料プランで無制限に特訓できます。"),
    ).toBeTruthy();
    // アップグレード導線: プラン変更 UI のある設定画面（/settings）へのリンクを添える。
    const upgrade = screen.getByRole("link", { name: "プランをアップグレード" });
    expect(upgrade.getAttribute("href")).toBe("/settings");
    // セッションは始まらない（残り秒も quiz_start も無い。カードはそのまま）。
    expect(screen.queryByText(/残り/)).toBeNull();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("その他の開始エラー（500）にはアップグレード導線を出さない", async () => {
    stubMe("free");
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 500 });
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(screen.getByText(/開始できませんでした/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "プランをアップグレード" })).toBeNull();
  });
});

// seed=1 の決定的出題（packages/ui の generateChinitsuQuestion/generateEfficiencyQuestion を
// createQuizRng(1) で実測した期待値。生成はモックしない）:
//   清一色 Q1: 1p2p3p4p4p5p5p5p6p6p7p8p9p → 待ち 4p/5p/6p、Q2 は索子の手
//   牌効率 Q1: 3m3m5m7m3p5p6p7p8p6s7s9s4z7z → 正解 9s/4z/7z、Q2 は 2z(南) を含む手
describe("TrainingScreen: 清一色（待ち牌の複数選択・完全一致）", () => {
  async function startChinitsu() {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();
  }

  it("待ち牌を全部選んで回答すると正解カウントが増え、0.5秒後に次問へ進む", async () => {
    await startChinitsu();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "5筒" }));
    fireEvent.click(screen.getByRole("button", { name: "6筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("正解！")).toBeTruthy();
    // 0.5秒の正誤表示のあと次問（seed=1 の Q2 は索子の手）へ。
    await advance(500);
    expect(screen.queryByText("正解！")).toBeNull();
    expect(screen.getByRole("button", { name: "1索" })).toBeTruthy();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
  });

  it("完全一致でない選択（一部だけ）は不正解として出題数だけ増える", async () => {
    await startChinitsu();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText(/不正解/)).toBeTruthy();
  });

  it("回答後は○×のみ表示し、正解の待ち牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startChinitsu();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（4p/5p/6p）の候補ボタンに correct ハイライトを付けない（見直しは結果画面で行う）。
    for (const name of ["4筒", "5筒", "6筒"]) {
      expect(screen.getByRole("button", { name }).className).not.toMatch(/correct/);
    }
  });

  it("待ち牌を選ぶまで回答ボタンは無効。選択はもう一度タップで解除できる", async () => {
    await startChinitsu();
    const submit = screen.getByRole("button", { name: "回答" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const four = screen.getByRole("button", { name: "4筒" });
    fireEvent.click(four);
    expect(four.getAttribute("aria-pressed")).toBe("true");
    expect(submit.disabled).toBe(false);
    fireEvent.click(four);
    expect(four.getAttribute("aria-pressed")).toBe("false");
    expect(submit.disabled).toBe(true);
  });
});

describe("TrainingScreen: 牌効率（牌タップ=切る）", () => {
  async function startEfficiency() {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
  }

  it("正解打牌（受け入れ最大）をタップすると正解カウントが増え、次問へ進む", async () => {
    await startEfficiency();
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("正解！")).toBeTruthy();
    await advance(500);
    // seed=1 の Q2 は南(2z)を含む手。
    expect(screen.getByRole("button", { name: "南" })).toBeTruthy();
  });

  it("非正解の牌をタップすると出題数だけ増える（不正解はスキップ扱いで次問へ）", async () => {
    await startEfficiency();
    fireEvent.click(screen.getAllByRole("button", { name: "3萬" })[0]!);
    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText(/不正解/)).toBeTruthy();
    await advance(500);
    expect(screen.getByRole("button", { name: "南" })).toBeTruthy();
  });

  it("回答後は○×のみ表示し、正解打牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startEfficiency();
    fireEvent.click(screen.getAllByRole("button", { name: "3萬" })[0]!);

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（9s/4z/7z）の牌ボタンに correct ハイライトを付けない（見直しは結果画面で行う）。
    for (const name of ["9索", "北", "中"]) {
      expect(screen.getByRole("button", { name }).className).not.toMatch(/correct/);
    }
  });
});

describe("TrainingScreen: 60秒経過と結果画面", () => {
  async function runOneCorrectEfficiency() {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // t=0 で正解（9索）→ t=500 で次問 → 以降は無回答のまま60秒経過（回答中の問題は打ち切り）。
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    await advance(500);
  }

  it("60秒経過で finishQuizSession に正しい total/correct が送られ、結果画面と quiz_complete が出る", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500); // 開始から60秒
    await flush();

    expect(h.finishQuizSessionAction).toHaveBeenCalledTimes(1);
    expect(h.finishQuizSessionAction).toHaveBeenCalledWith("qs1", {
      kind: "efficiency",
      total: 1,
      correct: 1,
      durationMs: 60_000,
    });
    // 結果画面（正解数・出題数・正答率・1分あたり◯問）。
    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText(/正答率 100%/)).toBeTruthy();
    expect(screen.getByText(/1分あたり1問/)).toBeTruthy();
    // 計測: quiz_complete は kind のみ（成績の数値を送らない）。
    expect(gtag).toHaveBeenCalledWith("event", "quiz_complete", { kind: "efficiency" });
    // 出題は終了している（牌ボタンが無い）。
    expect(screen.queryByRole("button", { name: "南" })).toBeNull();
  });

  it("結果送信に失敗しても結果画面は出し、エラーを小さく表示する", async () => {
    h.finishQuizSessionAction.mockResolvedValue({ ok: false, status: 404 });
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();

    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText(/結果の送信に失敗しました/)).toBeTruthy();
  });

  it("「もう一度」で種目選択に戻れる", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "もう一度" }));
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
  });
});

// seed=1 の出題列（createQuizRng(1) の実測。生成はモックしない）:
//   牌効率 Q1: 3m3m5m7m3p5p6p7p8p6s7s9s4z7z → 正解 9s/4z/7z
//   牌効率 Q2: 3m4m4p5p6p8p7s8s9s2z3z3z6z7z → 正解 2z(南)/6z(發)/7z(中)
//   清一色 Q1: 1p2p3p4p4p5p5p5p6p6p7p8p9p → 待ち 4p/5p/6p
//   清一色 Q2: 1s2s3s4s4s5s5s6s6s7s8s8s8s → 待ち 1s/3s/4s/6s/7s/9s
describe("TrainingScreen: 結果画面の見直しリスト", () => {
  /** グループ（問題/あなたの回答/正解）内の牌ラベルを表示順で取り出す。 */
  function tilesIn(row: HTMLElement, groupName: string): string[] {
    const group = within(row).getByRole("group", { name: groupName });
    return within(group)
      .getAllByRole("img")
      .map((el) => el.getAttribute("alt") ?? "");
  }

  it("牌効率: 回答した2問が○×・手牌・あなたの回答・正解（bestDiscards 全部）つきで並び、回答中だった問題は含めない", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // Q1 を 9索 で正解 → Q2 を 3萬 で不正解 → Q3 は回答中のまま60秒経過。
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2); // 回答中だった Q3 は含めない

    // 1問目: ○・手牌14枚・あなたの回答=切った牌・正解=受け入れ最大の打牌（同率全部）。
    expect(within(rows[0]!).getByText("○")).toBeTruthy();
    expect(tilesIn(rows[0]!, "問題")).toHaveLength(14);
    expect(tilesIn(rows[0]!, "あなたの回答")).toEqual(["9索"]);
    expect(tilesIn(rows[0]!, "正解")).toEqual(["9索", "北", "中"]);

    // 2問目: ×・あなたの回答=3萬・正解=南/發/中。
    expect(within(rows[1]!).getByText("×")).toBeTruthy();
    expect(tilesIn(rows[1]!, "あなたの回答")).toEqual(["3萬"]);
    expect(tilesIn(rows[1]!, "正解")).toEqual(["南", "發", "中"]);
  });

  it("清一色: あなたの回答=選んだ待ち牌・正解=answer の待ち牌が牌で並ぶ", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();
    // Q1 を 4筒5筒6筒 で正解 → Q2 を 1索 だけ（不完全）で不正解 → Q3 は回答中のまま60秒経過。
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "5筒" }));
    fireEvent.click(screen.getByRole("button", { name: "6筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: "1索" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    await advance(59_000);
    await flush();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    expect(within(rows[0]!).getByText("○")).toBeTruthy();
    expect(tilesIn(rows[0]!, "問題")).toHaveLength(13);
    expect(tilesIn(rows[0]!, "あなたの回答")).toEqual(["4筒", "5筒", "6筒"]);
    expect(tilesIn(rows[0]!, "正解")).toEqual(["4筒", "5筒", "6筒"]);

    expect(within(rows[1]!).getByText("×")).toBeTruthy();
    expect(tilesIn(rows[1]!, "あなたの回答")).toEqual(["1索"]);
    expect(tilesIn(rows[1]!, "正解")).toEqual(["1索", "3索", "4索", "6索", "7索", "9索"]);
  });

  it("1問も回答していなければ見直しリスト自体を出さない", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    await advance(60_000);
    await flush();

    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "見直しリスト" })).toBeNull();
  });
});
