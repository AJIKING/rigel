import type { QuizSessionDto } from "@rigel/client";
import type { QuizKind } from "@rigel/schema";
import type {
  ChinitsuQuestion,
  ChinitsuUkeireQuestion,
  EfficiencyQuestion,
  QuizQuestion,
  ScoreQuestion,
} from "@rigel/ui";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { stubMe } from "../problem/test-helpers";

const h = vi.hoisted(() => ({
  startQuizSessionAction: vi.fn(),
  finishQuizSessionAction: vi.fn(),
  listQuizSessionsAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { TrainingScreen } from "./TrainingScreen";

// GA4 の gtag をスタブ（trackEvent は window.gtag 経由。未定義なら何もしない）。
const gtag = vi.fn();

// ------------------------------------------------------------
// 出題フィクスチャ（generateQuestion 注入口から固定注入する）。
// かつての「seed=1 / seed=44 の実測焼き付け」は撤去した: 出題内容の正しさ
// （生成×採点＝この手の正解がこれ）は @rigel/ui のテスト（quiz.test.ts /
// ukeire.test.ts / tenpai.test.ts / score-engine 系）が担保しており、
// この画面テストは「注入された出題が正しく表示・遷移・記録されるか」の配線だけを検証する。
// ------------------------------------------------------------
const CHINITSU_QS: readonly ChinitsuQuestion[] = [
  {
    kind: "chinitsu",
    // Q1: 筒子13枚・待ち 4p/5p/6p
    // prettier-ignore
    tiles: ["1p", "2p", "3p", "4p", "4p", "5p", "5p", "5p", "6p", "6p", "7p", "8p", "9p"],
    answer: ["4p", "5p", "6p"],
  },
  {
    kind: "chinitsu",
    // Q2: 索子13枚・待ち6種
    // prettier-ignore
    tiles: ["1s", "2s", "3s", "4s", "4s", "5s", "5s", "6s", "6s", "7s", "8s", "8s", "8s"],
    answer: ["1s", "3s", "4s", "6s", "7s", "9s"],
  },
];
const EFFICIENCY_QS: readonly EfficiencyQuestion[] = [
  {
    kind: "efficiency",
    // Q1: 2向聴・正解 9s/4z/7z（受け入れ 4種16枚。3m 切りは向聴戻し）
    // prettier-ignore
    tiles: ["3m", "3m", "5m", "7m", "3p", "5p", "6p", "7p", "8p", "6s", "7s", "9s", "4z", "7z"],
    shanten: 2,
    answer: ["9s", "4z", "7z"],
  },
  {
    kind: "efficiency",
    // Q2: 2向聴・正解 2z(南)/6z(發)/7z(中)（受け入れ 10種34枚）
    // prettier-ignore
    tiles: ["3m", "4m", "4p", "5p", "6p", "8p", "7s", "8s", "9s", "2z", "3z", "3z", "6z", "7z"],
    shanten: 2,
    answer: ["2z", "6z", "7z"],
  },
];
const SCORE_QS: readonly ScoreQuestion[] = [
  {
    kind: "score",
    // Q1: 門前リーチ＋一盃口 2翻40符 = 親ロン3900点
    // prettier-ignore
    closedTiles: ["4m", "5m", "6m", "1p", "1p", "1p", "5p", "5p", "1s", "1s", "2s", "2s", "3s", "3s"],
    melds: [],
    winTile: "3s",
    tsumo: false,
    riichi: true,
    seatWind: "east",
    roundWind: "east",
    doraIndicators: ["5z"],
    yaku: [
      { name: "立直", han: 1 },
      { name: "一盃口", han: 1 },
    ],
    han: 2,
    fu: 40,
    label: "親（東家）・リーチ・ロン・場風 東",
    choices: ["7700点", "3900点", "4800点", "2600点"],
    answer: "3900点",
  },
  {
    kind: "score",
    // Q2: ポン中＋チー567s の混一色＋ドラ1 4翻30符 = 親ロン11600点（リーチなし）
    closedTiles: ["2s", "3s", "4s", "6s", "7s", "8s", "6z", "6z"],
    melds: [
      { type: "pon", tiles: ["7z", "7z", "7z"], from: "south" },
      { type: "chi", tiles: ["5s", "6s", "7s"], from: "south" },
    ],
    winTile: "3s",
    tsumo: false,
    riichi: false,
    seatWind: "east",
    roundWind: "east",
    doraIndicators: ["2s"],
    yaku: [
      { name: "役牌 中", han: 1 },
      { name: "混一色", han: 2 },
      { name: "ドラ", han: 1 },
    ],
    han: 4,
    fu: 30,
    label: "親（東家）・ロン・場風 東",
    choices: ["5800点", "3900点オール", "11600点", "7700点"],
    answer: "11600点",
  },
];
// 清一色 何切る: 1112244557788m（順子が作れない6種・6対子）＋9m の14枚。1向聴で、
// 1m を切ると七対子1向聴のまま受け入れ最大（同色のみ数える）。
const CHINITSU_UKEIRE_QS: readonly ChinitsuUkeireQuestion[] = [
  {
    kind: "chinitsuUkeire",
    // prettier-ignore
    tiles: ["1m", "1m", "1m", "2m", "2m", "4m", "4m", "5m", "5m", "7m", "7m", "8m", "8m", "9m"],
    suit: "m",
    shanten: 1,
    answer: ["1m"],
  },
];
const FIXTURES: Record<QuizKind, readonly QuizQuestion[]> = {
  chinitsu: CHINITSU_QS,
  efficiency: EFFICIENCY_QS,
  score: SCORE_QS,
  chinitsuUkeire: CHINITSU_UKEIRE_QS,
};

/** 種目ごとにフィクスチャを順番に出す generateQuestion（尽きたら循環。rng は使わない）。 */
function fixtureGenerate(): (kind: QuizKind) => QuizQuestion {
  const used: Record<QuizKind, number> = {
    chinitsu: 0,
    efficiency: 0,
    score: 0,
    chinitsuUkeire: 0,
  };
  return (kind) => FIXTURES[kind][used[kind]++ % FIXTURES[kind].length]!;
}

function renderScreen() {
  return render(
    <AuthProvider>
      <TrainingScreen generateQuestion={fixtureGenerate()} />
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

/** 直近記録1件を作る（既定: 清一色・10問7正解・JST 7/24 12:05）。 */
function session(over: Partial<QuizSessionDto> & { id: string }): QuizSessionDto {
  return {
    kind: "chinitsu",
    total: 10,
    correct: 7,
    durationMs: 60_000,
    createdAt: "2026-07-24T03:05:00.000Z",
    ...over,
  };
}

/** 種目カードをタップして開始ダイアログを開く（直近記録の取得まで解決する）。 */
async function openDialog(name: RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
  await flush();
}

/** ダイアログの「開始」→ 3→2→1 のカウントダウン（3秒）を経て第1問まで進める。 */
async function startViaDialog(name: RegExp) {
  await openDialog(name);
  fireEvent.click(screen.getByRole("button", { name: "開始" }));
  await flush();
  await advance(3000);
}

beforeEach(() => {
  vi.useFakeTimers();
  h.startQuizSessionAction.mockReset().mockResolvedValue({
    ok: true,
    id: "qs1",
    remainingToday: 2,
  });
  h.finishQuizSessionAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.listQuizSessionsAction.mockReset().mockResolvedValue([]);
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

  it("ログイン中: 3種目のカード＋説明が出る。キャッチコピー・無料枠の注記は出さない（文言削減）", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /牌効率（受け入れ最大）/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /点数計算/ })).toBeTruthy();
    expect(screen.getByText(/待ち牌を全部見抜く/)).toBeTruthy();
    expect(screen.getByText(/受け入れが最大になる1枚を切る/)).toBeTruthy();
    expect(screen.getByText(/牌姿から点数を即答する（鳴き・ドラあり）/)).toBeTruthy();
    // 文言削減（[決定] 2026-07-25 オーナーレビュー）: キャッチコピーと無料枠の注記は出さない
    //（上限は 402 時の文言とプランカードで伝える）。
    expect(screen.queryByText(/60秒でどれだけ解ける/)).toBeNull();
    expect(screen.queryByText(/1日3回まで/)).toBeNull();
  });
});

describe("TrainingScreen: 開始ダイアログ（カードタップでは枠を消費しない）", () => {
  it("カードをタップすると開始ダイアログ（種目名＋説明＋直近記録）が出て、開始 API はまだ呼ばれない", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);

    const dialog = screen.getByRole("dialog", { name: "清一色 多面待ちを開始" });
    expect(within(dialog).getByText(/待ち牌を全部見抜く/)).toBeTruthy();
    // ルール一文（[決定] 2026-07-26）: 種目名/説明の近くに1文だけ出す。
    expect(within(dialog).getByText("60秒でできるだけ多くの問題に答える")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "開始" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "もどる" })).toBeTruthy();
    // 開始 API は呼ばれない（枠は「開始」を押すまで消費しない）。直近記録だけ取得する。
    expect(h.startQuizSessionAction).not.toHaveBeenCalled();
    expect(h.listQuizSessionsAction).toHaveBeenCalledTimes(1);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("直近の記録は同じ種目の最新5件だけを「M/D HH:mm ・ 正解 X/Y問 ・ 正答率 Z%」で出す", async () => {
    stubMe("free");
    // 新しい順（API 契約）: 先頭は他種目（efficiency）→ 清一色6件（6件目は溢れて出さない）。
    h.listQuizSessionsAction.mockResolvedValue([
      session({ id: "e1", kind: "efficiency", createdAt: "2026-07-24T05:00:00.000Z" }),
      session({ id: "c1", createdAt: "2026-07-24T03:05:00.000Z", correct: 7, total: 10 }),
      session({ id: "c2", createdAt: "2026-07-23T10:00:00.000Z", correct: 5, total: 8 }),
      session({ id: "c3", createdAt: "2026-07-22T00:30:00.000Z", correct: 9, total: 12 }),
      session({ id: "c4", createdAt: "2026-07-21T02:00:00.000Z", correct: 3, total: 9 }),
      session({ id: "c5", createdAt: "2026-07-20T01:00:00.000Z", correct: 10, total: 10 }),
      session({ id: "c6", createdAt: "2026-07-19T01:00:00.000Z", correct: 1, total: 10 }),
    ]);
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);

    const list = within(screen.getByRole("dialog")).getByRole("list", { name: "直近の記録" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual([
      "7/24 12:05 ・ 正解 7/10問 ・ 正答率 70%",
      "7/23 19:00 ・ 正解 5/8問 ・ 正答率 63%",
      "7/22 09:30 ・ 正解 9/12問 ・ 正答率 75%",
      "7/21 11:00 ・ 正解 3/9問 ・ 正答率 33%",
      "7/20 10:00 ・ 正解 10/10問 ・ 正答率 100%",
    ]);
  });

  it("記録が無ければ「まだ特訓の記録がありません」を出す", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("まだ特訓の記録がありません")).toBeTruthy();
    expect(within(dialog).queryByRole("list", { name: "直近の記録" })).toBeNull();
  });

  it("「もどる」でダイアログが閉じ、開始 API は呼ばれないまま種目選択に戻る", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);
    fireEvent.click(screen.getByRole("button", { name: "もどる" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(h.startQuizSessionAction).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("「開始」で開始 API（枠消費）と quiz_start が走り、3→2→1 のカウントダウン後に第1問と60秒タイマーが始まる", async () => {
    stubMe("free");
    renderScreen(); // 清一色 Q1 フィクスチャ = 筒子13枚・待ち 4p/5p/6p（固定注入）
    await flush();
    await openDialog(/清一色 多面待ち/);
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await flush();

    expect(h.startQuizSessionAction).toHaveBeenCalledWith("chinitsu");
    expect(gtag).toHaveBeenCalledWith("event", "quiz_start", { kind: "chinitsu" });
    // ダイアログは閉じ、カウントダウン「3」（この間は牌も残り秒も見せない）。
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("3");
    expect(screen.queryByRole("button", { name: "1筒" })).toBeNull();
    expect(screen.queryByText(/残り/)).toBeNull();
    await advance(1000);
    expect(screen.getByRole("status").textContent).toBe("2");
    await advance(1000);
    expect(screen.getByRole("status").textContent).toBe("1");
    await advance(1000);
    // 0 になったら第1問表示と同時に60秒開始。スコア表示・残り回数非表示は従来どおり。
    expect(screen.getByRole("button", { name: "1筒" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "9筒" })).toBeTruthy();
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.queryByText(/今日あと/)).toBeNull();
    await advance(1000);
    expect(screen.getByText("残り 59秒")).toBeTruthy();
  });

  it("カウントダウン中は60秒タイマーが減らない（3秒進めても残り60秒のまま）", async () => {
    stubMe("free");
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await flush();
    await advance(3000); // カウントダウン3秒ぶん

    expect(screen.getByText("残り 60秒")).toBeTruthy();
  });

  it("402（無料枠の使い切り）はダイアログ内に上限メッセージと導線を出し、カウントダウンもセッションも始まらない", async () => {
    stubMe("free");
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await flush();

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("本日の無料枠（3回）を使い切りました。有料プランなら無制限です。"),
    ).toBeTruthy();
    // アップグレード導線: プラン変更 UI のある設定画面（/settings）へのリンクをダイアログ内に添える。
    const upgrade = within(dialog).getByRole("link", { name: "プランをアップグレード" });
    expect(upgrade.getAttribute("href")).toBe("/settings");
    // カウントダウンもセッションも始まらない（quiz_start も送らない）。
    await advance(3000);
    expect(screen.queryByText(/残り/)).toBeNull();
    expect(screen.queryByRole("button", { name: "1筒" })).toBeNull();
    expect(gtag).not.toHaveBeenCalled();
  });

  it("その他の開始エラー（500）はダイアログ内に汎用文言を出し、アップグレード導線は出さない", async () => {
    stubMe("free");
    h.startQuizSessionAction.mockResolvedValue({ ok: false, status: 500 });
    renderScreen();
    await flush();
    await openDialog(/清一色 多面待ち/);
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
    await flush();

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/開始できませんでした/)).toBeTruthy();
    expect(within(dialog).queryByRole("link", { name: "プランをアップグレード" })).toBeNull();
  });
});

// 出題は CHINITSU_QS / EFFICIENCY_QS フィクスチャの固定注入（ファイル冒頭参照）。
describe("TrainingScreen: 清一色（待ち牌の複数選択・完全一致）", () => {
  async function startChinitsu() {
    stubMe("free");
    renderScreen();
    await flush();
    await startViaDialog(/清一色 多面待ち/);
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
    // 0.5秒の正誤表示のあと次問（フィクスチャ Q2 は索子の手）へ。
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
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
  }

  it("正解打牌（受け入れ最大）をタップすると正解カウントが増え、次問へ進む", async () => {
    await startEfficiency();
    // 出題指示文は最短（同率ルールは種目選択カードの説明に寄せた）。
    expect(screen.getByText("受け入れ最大の牌を切る")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
    await advance(500);
    // フィクスチャ Q2 は南(2z)を含む手。
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

// 出題は SCORE_QS フィクスチャの固定注入（Q1=門前リーチ・Q2=副露入り。ファイル冒頭参照）。
describe("TrainingScreen: 点数計算（4択・牌姿ベース v2）", () => {
  async function startScore() {
    stubMe("free");
    renderScreen();
    await flush();
    await startViaDialog(/点数計算/);
  }

  /** グループ内の牌ラベルを表示順で取り出す（scope 省略時は画面全体）。 */
  function tileAlts(name: string, scope?: HTMLElement): string[] {
    return within((scope ? within(scope) : screen).getByRole("group", { name }))
      .getAllByRole("img")
      .map((el) => el.getAttribute("alt") ?? "");
  }

  it("条件ラベル（リーチ入り）・ドラ表示・牌姿（手牌+和了牌を分けて表示）・選択肢4ボタンが出る（翻数・符は見せない）", async () => {
    await startScore();
    expect(screen.getByText("点数を選ぶ")).toBeTruthy();
    // 親か子か＋リーチの有無は点数計算の本質なのでラベルに明示する（リーチはツモ/ロンの前）。
    expect(screen.getByText("親（東家）・リーチ・ロン・場風 東")).toBeTruthy();
    // ドラ表示牌（小ラベル+牌1枚）。
    expect(screen.getByText("ドラ表示")).toBeTruthy();
    expect(tileAlts("ドラ表示")).toEqual(["白"]);
    // 手牌は門前部分から和了牌1枚を除いた13枚。和了牌は分けて強調する。
    // prettier-ignore
    expect(tileAlts("手牌")).toEqual(["4萬", "5萬", "6萬", "1筒", "1筒", "1筒", "5筒", "5筒", "1索", "1索", "2索", "2索", "3索"]);
    expect(tileAlts("上がり牌")).toEqual(["3索"]);
    // 和了牌にはツモ/ロンのバッジを添える。
    expect(within(screen.getByRole("group", { name: "上がり牌" })).getByText("ロン")).toBeTruthy();
    // Q1 は門前（副露なし）。
    expect(screen.queryByRole("group", { name: "副露" })).toBeNull();
    // 選択肢は rng で決定的にシャッフルされた4ボタン。
    for (const c of ["7700点", "3900点", "4800点", "2600点"]) {
      expect(screen.getByRole("button", { name: c })).toBeTruthy();
    }
    // 翻数・符は表示しない（自分で数えるのが問題）。
    expect(screen.queryByText(/2翻40符/)).toBeNull();
  });

  it("正解の選択肢をタップすると正解カウントが増え、0.5秒後に次問（副露入り）へ進む", async () => {
    await startScore();
    fireEvent.click(screen.getByRole("button", { name: "3900点" }));
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
    await advance(500);
    // 次問（Q2）: 親（東家）・ポン+チー入りの手（リーチなし → ラベルにリーチを含めない）。
    expect(screen.getByText("親（東家）・ロン・場風 東")).toBeTruthy();
    expect(screen.queryByText(/リーチ/)).toBeNull();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    // prettier-ignore
    expect(tileAlts("手牌")).toEqual(["2索", "4索", "6索", "7索", "8索", "發", "發"]);
    const melds = screen.getAllByRole("group", { name: "副露" });
    expect(melds).toHaveLength(2);
    expect(
      within(melds[0]!)
        .getAllByRole("img")
        .map((el) => el.getAttribute("alt")),
    ).toEqual(["中", "中", "中"]);
    expect(
      within(melds[1]!)
        .getAllByRole("img")
        .map((el) => el.getAttribute("alt")),
    ).toEqual(["5索", "6索", "7索"]);
    expect(tileAlts("上がり牌")).toEqual(["3索"]);
    expect(within(screen.getByRole("group", { name: "上がり牌" })).getByText("ロン")).toBeTruthy();
    expect(tileAlts("ドラ表示")).toEqual(["2索"]);
  });

  it("不正解の選択肢は出題数だけ増える（スキップ扱いで次問へ）", async () => {
    await startScore();
    fireEvent.click(screen.getByRole("button", { name: "7700点" }));
    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText("× 不正解")).toBeTruthy();
  });

  it("結果画面の見直しリスト: 条件（リーチ入り）・ドラ表示・牌姿・あなたの回答・正解・役の内訳が並ぶ", async () => {
    await startScore();
    // Q1 を正解（3900点）→ Q2 を不正解（3900点オール）→ 60秒経過。
    fireEvent.click(screen.getByRole("button", { name: "3900点" }));
    await advance(500);
    fireEvent.click(screen.getByRole("button", { name: "3900点オール" }));
    await advance(500);
    await advance(59_000);
    await flush();

    expect(h.finishQuizSessionAction).toHaveBeenCalledWith("qs1", {
      kind: "score",
      total: 2,
      correct: 1,
      durationMs: 60_000,
    });
    const list = screen.getByRole("list", { name: "見直しリスト" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);

    // 1問目: ○・条件（リーチ入り）・ドラ表示・牌姿（手牌13+上がり1）・回答/正解のテキスト行＋
    // 役の内訳（立直 1翻 が scoreYakuLine 経由で並ぶ）。
    expect(within(rows[0]!).getByText("○")).toBeTruthy();
    expect(within(rows[0]!).getByText("親（東家）・リーチ・ロン・場風 東")).toBeTruthy();
    expect(tileAlts("ドラ表示", rows[0]!)).toEqual(["白"]);
    const tiles1 = tileAlts("牌姿", rows[0]!);
    expect(tiles1).toHaveLength(14);
    expect(tiles1.slice(-1)).toEqual(["3索"]); // 上がり牌は末尾に分けて置く
    // あなたの回答と正解が同じ文字列（正解した問題）。
    expect(within(rows[0]!).getAllByText("3900点")).toHaveLength(2);
    // 役の内訳（練習サイトの解説に相当。ドラ行が無ければ役だけ）。
    expect(within(rows[0]!).getByText("立直 1翻・一盃口 1翻・計2翻40符")).toBeTruthy();

    // 2問目: ×・副露（ポン+チー）込みの牌姿14枚・あなたの回答=3900点オール・正解=11600点＋役の内訳。
    expect(within(rows[1]!).getByText("×")).toBeTruthy();
    expect(within(rows[1]!).getByText("親（東家）・ロン・場風 東")).toBeTruthy();
    expect(tileAlts("ドラ表示", rows[1]!)).toEqual(["2索"]);
    const tiles2 = tileAlts("牌姿", rows[1]!);
    expect(tiles2).toHaveLength(14); // 手牌7 + ポン3 + チー3 + 上がり1
    expect(tiles2.slice(-1)).toEqual(["3索"]);
    expect(within(rows[1]!).getByText("3900点オール")).toBeTruthy();
    expect(within(rows[1]!).getByText("11600点")).toBeTruthy();
    expect(within(rows[1]!).getByText("役牌 中 1翻・混一色 2翻・ドラ1・計4翻30符")).toBeTruthy();
    // 受け入れ詳細（牌効率専用）は出さない。
    expect(within(rows[0]!).queryByText(/受け入れ/)).toBeNull();
  });
});

describe("TrainingScreen: 60秒経過と結果画面", () => {
  async function runOneCorrectEfficiency() {
    stubMe("free");
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
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

  it("前セッションの結果送信が遅れて失敗しても、新しいセッションにエラーを混入させない（sessionId 一致ガード）", async () => {
    // セッション1（qs1）の送信は保留にし、セッション2（qs2）開始後に失敗させる。
    let settleFirst!: (v: { ok: boolean; status: number }) => void;
    h.startQuizSessionAction
      .mockResolvedValueOnce({ ok: true, id: "qs1", remainingToday: 2 })
      .mockResolvedValueOnce({ ok: true, id: "qs2", remainingToday: 1 });
    h.finishQuizSessionAction.mockImplementationOnce(
      () =>
        new Promise<{ ok: boolean; status: number }>((resolve) => {
          settleFirst = resolve;
        }),
    );
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();

    // もう一度挑戦（qs2）→ カウントダウンを経て新セッション中に、qs1 の送信失敗が今さら届く。
    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    await advance(3000);
    settleFirst({ ok: false, status: 500 });
    await flush();

    // qs2 を無回答で終える（qs2 の送信は成功）→ qs1 の遅延失敗は表示に混入しない。
    await advance(60_000);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();
    expect(h.finishQuizSessionAction).toHaveBeenLastCalledWith(
      "qs2",
      expect.objectContaining({ durationMs: 60_000 }),
    );
    expect(screen.queryByText(/結果の送信に失敗しました/)).toBeNull();
  });

  it("「もう一度挑戦」は同じ種目で開始 API を再度呼び、カウントダウンを経て新しいセッションが始まる", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    expect(h.startQuizSessionAction).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(h.startQuizSessionAction).toHaveBeenCalledTimes(2);
    expect(h.startQuizSessionAction).toHaveBeenLastCalledWith("efficiency");
    // 結果画面は閉じ、初回開始と同じ 3→2→1 のカウントダウンから始まる。
    expect(screen.queryByText("結果")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("3");
    await advance(3000);
    // 新しいセッション: スコアはリセット・残り60秒から。
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
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

// 出題はフィクスチャの固定注入（ファイル冒頭参照）。受け入れ詳細の期待値
// （4種16枚・10種34枚・14種48枚・向聴戻し）は同じ手に対する @rigel/ui の
// ukeireReviewModel / discardUkeires のテストと同一ルールで計算される実値。
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
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
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
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
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
    renderScreen();
    await flush();
    await startViaDialog(/清一色 多面待ち/);
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
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
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
    renderScreen();
    await flush();
    await startViaDialog(/清一色 多面待ち/);
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
    renderScreen();
    await flush();
    await startViaDialog(/牌効率/);
    await advance(60_000);
    await flush();

    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "見直しリスト" })).toBeNull();
  });
});

describe("TrainingScreen: dev プレビュー用の注入口（/dev/training が使う）", () => {
  it("user/startSession/finishSession/listSessions/sessionSeconds/countdownSeconds を注入すると、認証状態と Server Action の代わりに注入分を使う", async () => {
    stubMe(null); // /api/me は未ログイン応答でも、注入 user が優先される（API 不要のプレビュー）。
    const startSession = vi.fn().mockResolvedValue({ ok: true, id: "dev-s", remainingToday: 2 });
    const finishSession = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const listSessions = vi.fn().mockResolvedValue([session({ id: "dev-r", kind: "efficiency" })]);
    render(
      <AuthProvider>
        <TrainingScreen
          seed={1}
          sessionSeconds={1}
          countdownSeconds={0}
          user={{ id: "dev", plan: "free" }}
          startSession={startSession}
          finishSession={finishSession}
          listSessions={listSessions}
        />
      </AuthProvider>,
    );
    await flush();

    // 注入 user により種目カードが出る（ログイン導線ではない）。直近記録は注入 listSessions から。
    await openDialog(/牌効率/);
    expect(listSessions).toHaveBeenCalledTimes(1);
    expect(h.listQuizSessionsAction).not.toHaveBeenCalled();
    expect(
      within(screen.getByRole("dialog")).getByText("7/24 12:05 ・ 正解 7/10問 ・ 正答率 70%"),
    ).toBeTruthy();

    // countdownSeconds=0 → カウントダウンを飛ばして即セッション（dev の phase ショートカット用）。
    fireEvent.click(screen.getByRole("button", { name: "開始" }));
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

describe("TrainingScreen: 清一色 何切る（牌タップ=切る・広さ最大）", () => {
  async function startChinitsuUkeire() {
    stubMe("free");
    renderScreen();
    await flush();
    await startViaDialog(/清一色 何切る/);
  }

  it("指示文は種目のもの（牌効率の文言を使い回さない）", async () => {
    await startChinitsuUkeire();
    expect(screen.getByText("一番広くなる牌を切る")).toBeTruthy();
    expect(screen.queryByText("受け入れ最大の牌を切る")).toBeNull();
  });

  it("正解打牌をタップすると正解カウントが増える", async () => {
    await startChinitsuUkeire();
    fireEvent.click(screen.getAllByRole("button", { name: "1萬" })[0]!);
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
  });

  it("見直し行に受け入れ詳細が出て、他色を数えない（同色だけで広さを測る）", async () => {
    await startChinitsuUkeire();
    fireEvent.click(screen.getAllByRole("button", { name: "1萬" })[0]!);
    await advance(500);
    await advance(59_500);
    await flush();

    const list = screen.getByRole("list", { name: "見直しリスト" });
    const mine = within(list).getByRole("group", { name: "あなたの回答の受け入れ" });
    const alts = within(mine)
      .getAllByRole("img")
      .map((el) => el.getAttribute("alt") ?? "");
    expect(alts.length).toBeGreaterThan(0);
    expect(alts.every((a) => a.endsWith("萬"))).toBe(true);
  });
});
