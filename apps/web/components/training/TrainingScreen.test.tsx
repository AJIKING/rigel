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
  it("認証確認中は「読み込み中…」を role=status で出す（真っ白にしない）", async () => {
    stubMe("free");
    renderScreen();
    // /api/me がまだ解決していない（flush 前）＝認証確認中。
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("読み込み中…");
    // 確認が終わると消えて、本来の画面（種目カード）が出る。
    await flush();
    expect(screen.queryByText("読み込み中…")).toBeNull();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
  });

  it("未ログインはログイン導線を出し、種目カードは出さない", async () => {
    stubMe(null);
    renderScreen();
    await flush();
    const note = screen.getByText(/特訓するには/);
    expect(within(note).getByRole("link", { name: "ログイン" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /清一色 多面待ち/ })).toBeNull();
  });

  it("ログイン中: 2種目のカード＋説明が出る。キャッチコピー・無料枠の注記は出さない（文言削減）", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /牌効率（受け入れ最大）/ })).toBeTruthy();
    expect(screen.getByText(/待ち牌を全部見抜く/)).toBeTruthy();
    expect(screen.getByText(/受け入れが最大になる1枚を切る/)).toBeTruthy();
    // 文言削減（[決定] 2026-07-25 オーナーレビュー）: キャッチコピーと無料枠の注記は出さない
    //（上限は 402 時の文言とプランカードで伝える）。
    expect(screen.queryByText(/60秒でどれだけ解ける/)).toBeNull();
    expect(screen.queryByText(/1日3回まで/)).toBeNull();
  });
});

describe("TrainingScreen: セッション開始", () => {
  it("カードをタップすると startQuizSessionAction(kind) が呼ばれ、問題（牌）と60秒・スコアが表示され quiz_start が送られる", async () => {
    stubMe("free");
    renderScreen(1); // seed=1 の清一色 Q1 = 筒子13枚・待ち 4p/5p/6p（決定的生成）
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(h.startQuizSessionAction).toHaveBeenCalledWith("chinitsu");
    // 出題: 待ち牌の候補ボタン（その色の1〜9）が出る。
    expect(screen.getByRole("button", { name: "1筒" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "9筒" })).toBeTruthy();
    // ヘッダ: スコア・残り秒（60秒）。残り回数（今日あと◯回）はサーバ応答に
    // remainingToday があっても表示しない（[決定] 2026-07-25 オーナーレビュー）。
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.queryByText(/今日あと/)).toBeNull();
    // 計測: quiz_start（params は kind のみ＝成績を送らない）。
    expect(gtag).toHaveBeenCalledWith("event", "quiz_start", { kind: "chinitsu" });
  });

  it("402（無料枠の使い切り）は上限メッセージを出し、セッションは始まらない", async () => {
    stubMe("free");
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(
      screen.getByText("本日の無料枠（3回）を使い切りました。有料プランなら無制限です。"),
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
    // 出題指示文は最短（補足は種目選択カードの説明に寄せた）。
    expect(screen.getByText("待ち牌を全部選ぶ")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "5筒" }));
    fireEvent.click(screen.getByRole("button", { name: "6筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
    // 0.5秒の正誤表示のあと次問（seed=1 の Q2 は索子の手）へ。
    await advance(500);
    expect(screen.queryByText("○ 正解")).toBeNull();
    expect(screen.getByRole("button", { name: "1索" })).toBeTruthy();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
  });

  it("完全一致でない選択（一部だけ）は不正解として出題数だけ増える", async () => {
    await startChinitsu();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText("× 不正解")).toBeTruthy();
  });

  it("フィードバック帯: 回答受付中も固定スロット（空）が存在し、回答直後だけ○/×が入り0.5秒後に空へ戻る（レイアウトシフトなし・牌に被せない）", async () => {
    await startChinitsu();
    // 回答前: 帯スロットは空のまま存在する（高さ固定でレイアウトシフトを起こさない）。
    expect(screen.getByRole("status").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    // 回答直後: 帯に不正解の文言（最短）。
    expect(screen.getByRole("status").textContent).toBe("× 不正解");
    // 0.5秒後: 次問と同時に空へ戻る（帯スロット自体は残る）。
    await advance(500);
    expect(screen.getByRole("status").textContent).toBe("");
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
    // 出題指示文は最短（同率ルールは種目選択カードの説明に寄せた）。
    expect(screen.getByText("受け入れ最大の牌を切る")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
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
    // 結果画面（正解数・出題数・正答率。60秒固定なので「1分あたり」は出さない＝意味の重複を避ける）。
    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.getByText("正解 1問")).toBeTruthy();
    expect(screen.getByText("出題 1問")).toBeTruthy();
    expect(screen.getByText("正答率 100%")).toBeTruthy();
    expect(screen.queryByText(/1分あたり/)).toBeNull();
    // 残り回数（今日あと◯回）は結果画面にも出さない（[決定] 2026-07-25 オーナーレビュー）。
    expect(screen.queryByText(/今日あと/)).toBeNull();
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
    expect(screen.getByText("正解 1問")).toBeTruthy();
    // エラーは敬体＋影響（この挑戦は記録に残らない）まで伝える。
    expect(screen.getByText("結果の送信に失敗しました。この挑戦は記録に残りません。")).toBeTruthy();
  });

  it("「もう一度挑戦」は同じ種目で開始 API を再度呼び、新しいセッションが始まる", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    expect(h.startQuizSessionAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(h.startQuizSessionAction).toHaveBeenCalledTimes(2);
    expect(h.startQuizSessionAction).toHaveBeenLastCalledWith("efficiency");
    // 新しいセッション: スコアはリセット・残り60秒から。結果画面は閉じる。
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
    expect(screen.queryByText("結果")).toBeNull();
  });

  it("「もう一度挑戦」が402なら結果画面のまま上限メッセージとアップグレード導線を出す", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });

    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    // セッションは始まらず、結果画面の上でメッセージと導線を出す。
    expect(screen.getByText("結果")).toBeTruthy();
    expect(
      screen.getByText("本日の無料枠（3回）を使い切りました。有料プランなら無制限です。"),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "プランをアップグレード" })).toBeTruthy();
    expect(screen.queryByText(/残り \d+秒/)).toBeNull();
  });

  it("「問題選択にもどる」で種目選択に戻れる", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "問題選択にもどる" }));
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(h.startQuizSessionAction).toHaveBeenCalledTimes(1); // 戻るだけでは開始しない
  });

  it("「もう一度挑戦」の402後に「問題選択にもどる」と、上限メッセージと導線を選択画面へ持ち越さない", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(screen.getByText(/本日の無料枠/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "問題選択にもどる" }));
    // 選択画面: エラーは消える（上限はプランカードで伝える方針。貼り付いたままにしない）。
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.queryByText(/本日の無料枠/)).toBeNull();
    expect(screen.queryByRole("link", { name: "プランをアップグレード" })).toBeNull();
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
    // 見出しテキスト「見直し」は出さない（リストを直接置く。aria-label は維持
    //  [決定] 2026-07-25 オーナーレビュー）。
    expect(screen.queryByText("見直し")).toBeNull();

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

  it("見直し行は「番号＋○×」のヘッダ行と「問題」ラベル行に分かれる（問題も回答・正解と同じ並び）", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    await advance(59_500);
    await flush();

    const row = within(screen.getByRole("list", { name: "見直しリスト" })).getAllByRole(
      "listitem",
    )[0]!;
    const mark = within(row).getByText("○");
    const problem = within(row).getByRole("group", { name: "問題" });
    // ヘッダ（番号＋○×）と問題の牌列は行（li の直下要素）を分ける。
    const lineOf = (el: HTMLElement) => Array.from(row.children).find((c) => c.contains(el));
    expect(lineOf(mark)).not.toBe(lineOf(problem));
    // 問題行はラベル＋牌列（あなたの回答・正解と同じ構造）で、ラベルと牌列が同じ行に載る。
    const problemLabel = within(row).getByText("問題");
    expect(lineOf(problemLabel)).toBe(lineOf(problem));
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

  // 受け入れ詳細の期待値は @rigel/ui の discardUkeires を一時プローブで実測し検算済み:
  //   Q1(3m3m5m7m3p5p6p7p8p6s7s9s4z7z): 最小向聴2。9s/4z/7z 切り → 受け入れ 4種16枚(6m,4p,5s,8s)。
  //     3m 切りは 3向聴（向聴戻し）→ 受け入れ 11種38枚。
  //   Q2(3m4m4p5p6p8p7s8s9s2z3z3z6z7z): 最小向聴2。2z/6z/7z 切り → 受け入れ 10種34枚。
  //     3m 切りは 3向聴（向聴戻し）→ 受け入れ 14種48枚(2m〜6m,3p,6p〜9p,2z,3z,6z,7z)。
  it("牌効率: 見直し行に受け入れ詳細（あなたの回答の種類・枚数・向聴戻し / 正解各打牌の受け入れ）が出る", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // Q1 を 9索（正解・向聴維持）→ Q2 を 3萬（不正解・向聴戻し）で回答して60秒経過。
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");

    // 1問目: あなたの回答（9索）は最小向聴を保つ → バッジ無し・受け入れ 4種16枚。
    const mine1 = within(rows[0]!).getByRole("group", { name: "あなたの回答の受け入れ" });
    expect(within(mine1).getByText("受け入れ 4種16枚")).toBeTruthy();
    expect(
      within(mine1)
        .getAllByRole("img")
        .map((el) => el.getAttribute("alt")),
    ).toEqual(["6萬", "4筒", "5索", "8索"]);
    expect(within(rows[0]!).queryByText("向聴戻し")).toBeNull();
    // 正解（9s/4z/7z）ごとに受け入れ行が並ぶ（あなたの回答と重複表示してよい）。
    for (const name of ["9索", "北", "中"]) {
      const g = within(rows[0]!).getByRole("group", { name: `正解${name}の受け入れ` });
      expect(within(g).getByText("受け入れ 4種16枚")).toBeTruthy();
      expect(
        within(g)
          .getAllByRole("img")
          .map((el) => el.getAttribute("alt")),
      ).toEqual(["6萬", "4筒", "5索", "8索"]);
    }

    // 2問目: あなたの回答（3萬）は向聴戻し（2→3向聴）→ 赤バッジ・受け入れ 14種48枚。
    const mine2 = within(rows[1]!).getByRole("group", { name: "あなたの回答の受け入れ" });
    expect(within(mine2).getByText("向聴戻し")).toBeTruthy();
    expect(within(mine2).getByText("受け入れ 14種48枚")).toBeTruthy();
    expect(
      within(mine2)
        .getAllByRole("img")
        .map((el) => el.getAttribute("alt")),
    ).toEqual(
      // prettier-ignore
      ["2萬", "3萬", "4萬", "5萬", "6萬", "3筒", "6筒", "7筒", "8筒", "9筒", "南", "西", "發", "中"],
    );
    // 正解（2z/6z/7z）の各受け入れ（10種34枚。切った字牌だけが互いに入れ替わる）。
    const expected2: ReadonlyArray<[string, string[]]> = [
      ["南", ["2萬", "5萬", "3筒", "6筒", "7筒", "8筒", "9筒", "西", "發", "中"]],
      ["發", ["2萬", "5萬", "3筒", "6筒", "7筒", "8筒", "9筒", "南", "西", "中"]],
      ["中", ["2萬", "5萬", "3筒", "6筒", "7筒", "8筒", "9筒", "南", "西", "發"]],
    ];
    for (const [name, tiles] of expected2) {
      const g = within(rows[1]!).getByRole("group", { name: `正解${name}の受け入れ` });
      expect(within(g).getByText("受け入れ 10種34枚")).toBeTruthy();
      expect(
        within(g)
          .getAllByRole("img")
          .map((el) => el.getAttribute("alt")),
      ).toEqual(tiles);
    }
  });

  it("清一色: 見直し行に受け入れ詳細を出さない（待ち牌の比較のみで現状維持）", async () => {
    stubMe("free");
    renderScreen(1);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    await advance(59_500);
    await flush();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");
    expect(within(rows[0]!).queryByRole("group", { name: /受け入れ/ })).toBeNull();
    expect(within(rows[0]!).queryByText(/受け入れ/)).toBeNull();
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

describe("TrainingScreen: dev プレビュー用の注入口（/dev/training が使う）", () => {
  it("user/startSession/finishSession/sessionSeconds を注入すると、認証状態と Server Action の代わりに注入分を使う", async () => {
    stubMe(null); // /api/me は未ログイン応答でも、注入 user が優先される（API 不要のプレビュー）。
    const startSession = vi.fn().mockResolvedValue({ ok: true, id: "dev-s", remainingToday: 2 });
    const finishSession = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    render(
      <AuthProvider>
        <TrainingScreen
          seed={1}
          sessionSeconds={1}
          user={{ id: "dev", plan: "free" }}
          startSession={startSession}
          finishSession={finishSession}
        />
      </AuthProvider>,
    );
    await flush();

    // 注入 user により種目カードが出る（ログイン導線ではない）。
    fireEvent.click(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    expect(startSession).toHaveBeenCalledWith("efficiency");
    expect(h.startQuizSessionAction).not.toHaveBeenCalled();

    // sessionSeconds=1 → 1秒で結果画面になり、結果は注入 finishSession に送られる。
    await advance(1000);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();
    expect(finishSession).toHaveBeenCalledWith("dev-s", {
      kind: "efficiency",
      total: 0,
      correct: 0,
      durationMs: 1000,
    });
    expect(h.finishQuizSessionAction).not.toHaveBeenCalled();
  });
});
