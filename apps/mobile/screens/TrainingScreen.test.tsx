import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { MiniTile } from "../components/MiniTile";
import { TrainingScreen } from "./TrainingScreen";

let mockAuth: { token: string | null; user: { plan: string } | null };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockStartQuizSession = jest.fn();
const mockFinishQuizSession = jest.fn();
jest.mock("../lib/api", () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
  finishQuizSession: (...args: unknown[]) => mockFinishQuizSession(...args),
}));

// Firebase Analytics はネイティブモジュールなのでラッパごとモックする（呼び出し内容を検証）。
const mockTrackEvent = jest.fn();
jest.mock("../lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

/** マイクロタスク（startQuizSession の解決など）と 0ms タイマーを流す。 */
async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

/** フェイクタイマーを ms ぶん進める（カウントダウン・正誤表示の 0.5 秒送り）。 */
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuth = { token: "t", user: { plan: "free" } };
  mockStartQuizSession.mockResolvedValue({ ok: true, id: "qs1", remainingToday: 2 });
  mockFinishQuizSession.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("TrainingScreen: 種目選択", () => {
  it("未ログインはログイン導線（メッセージ）を出し、種目カードは出さない", () => {
    mockAuth = { token: null, user: null };
    render(<TrainingScreen />);

    expect(screen.getByText(/特訓するにはログイン/)).toBeTruthy();
    expect(screen.queryByText(/清一色 多面待ち/)).toBeNull();
  });

  it.each([
    { name: "free は無料枠の注記を出す", plan: "free", shown: true },
    { name: "有料（next）は注記を出さない", plan: "next", shown: false },
  ])("ログイン中: 2種目のカード＋説明が出る（$name）", ({ plan, shown }) => {
    mockAuth = { token: "t", user: { plan } };
    render(<TrainingScreen />);

    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /牌効率（受け入れ最大）/ })).toBeTruthy();
    expect(screen.getByText(/待ち牌を全部選ぶ/)).toBeTruthy();
    expect(screen.getByText(/受け入れ枚数が最大になる牌を切る/)).toBeTruthy();
    const note = screen.queryByText("無料プランは1日3回まで（有料プランは無制限）");
    if (shown) expect(note).toBeTruthy();
    else expect(note).toBeNull();
  });
});

describe("TrainingScreen: セッション開始", () => {
  it("カードをタップすると startQuizSession(token, kind) が呼ばれ、問題（牌）と60秒・スコア・残り回数が表示され quiz_start が送られる", async () => {
    render(<TrainingScreen seed={1} />); // seed=1 の清一色 Q1 = 筒子13枚・待ち 4p/5p/6p（決定的生成）
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(mockStartQuizSession).toHaveBeenCalledWith("t", "chinitsu");
    // 出題: 待ち牌の候補ボタン（その色の1〜9）が出る。
    expect(screen.getByRole("button", { name: "1筒" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "9筒" })).toBeTruthy();
    // ヘッダ: スコア・残り秒（60秒）・free の残り回数（開始応答ベース）。
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.getByText("今日あと2回")).toBeTruthy();
    // 計測: quiz_start（params は kind のみ＝成績を送らない）。
    expect(mockTrackEvent).toHaveBeenCalledWith("quiz_start", { kind: "chinitsu" });
  });

  it("有料（remainingToday=null）は残り回数を表示しない", async () => {
    mockAuth = { token: "t", user: { plan: "next" } };
    mockStartQuizSession.mockResolvedValue({ ok: true, id: "qs1", remainingToday: null });
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();

    expect(mockStartQuizSession).toHaveBeenCalledWith("t", "efficiency");
    expect(screen.queryByText(/今日あと/)).toBeNull();
  });

  it("402（無料枠の使い切り）は上限メッセージとアップグレード導線を出し、セッションは始まらない", async () => {
    const onOpenSettings = jest.fn();
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    render(<TrainingScreen seed={1} onOpenSettings={onOpenSettings} />);
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(
      screen.getByText("本日の無料回数（3回）を使い切りました。有料プランで無制限に特訓できます。"),
    ).toBeTruthy();
    // アップグレード導線: 押すとプラン変更 UI のある設定タブへ（HomeTabs が配線）。
    fireEvent.press(screen.getByRole("button", { name: "プランをアップグレード" }));
    expect(onOpenSettings).toHaveBeenCalled();
    // セッションは始まらない（残り秒も quiz_start も無い。カードはそのまま）。
    expect(screen.queryByText(/残り/)).toBeNull();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("その他の開始エラー（500）にはアップグレード導線を出さない", async () => {
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 500 });
    render(<TrainingScreen seed={1} onOpenSettings={jest.fn()} />);
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(screen.getByText(/開始できませんでした/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "プランをアップグレード" })).toBeNull();
  });
});

// seed=1 の決定的出題（packages/ui の generateChinitsuQuestion/generateEfficiencyQuestion を
// createQuizRng(1) で実測した期待値。web の TrainingScreen.test.tsx と同一。生成はモックしない）:
//   清一色 Q1: 1p2p3p4p4p5p5p5p6p6p7p8p9p → 待ち 4p/5p/6p、Q2 は索子の手
//   牌効率 Q1: 3m3m5m7m3p5p6p7p8p6s7s9s4z7z → 正解 9s/4z/7z、Q2 は 2z(南) を含む手
describe("TrainingScreen: 清一色（待ち牌の複数選択・完全一致）", () => {
  async function startChinitsu() {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();
  }

  it("待ち牌を全部選んで回答すると正解カウントが増え、0.5秒後に次問へ進む", async () => {
    await startChinitsu();
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByRole("button", { name: "6筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

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
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText(/不正解/)).toBeTruthy();
  });

  it("回答後は○×のみ表示し、正解の待ち牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startChinitsu();
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（4p/5p/6p）を含め、どの牌にもハイライトを付けない（見直しは結果画面で行う）。
    expect(screen.UNSAFE_queryAllByType(MiniTile).filter((n) => n.props.highlight)).toHaveLength(0);
  });

  it("待ち牌を選ぶまで回答ボタンは無効。選択はもう一度タップで解除できる", async () => {
    await startChinitsu();
    const submit = screen.getByRole("button", { name: "回答" });
    expect(submit.props.accessibilityState.disabled).toBe(true);

    const four = screen.getByRole("button", { name: "4筒" });
    fireEvent.press(four);
    expect(four.props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("button", { name: "回答" }).props.accessibilityState.disabled).toBe(
      false,
    );

    fireEvent.press(four);
    expect(four.props.accessibilityState.selected).toBe(false);
    expect(screen.getByRole("button", { name: "回答" }).props.accessibilityState.disabled).toBe(
      true,
    );
    // 無効のまま押しても採点されない。
    fireEvent.press(screen.getByRole("button", { name: "回答" }));
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
  });
});

describe("TrainingScreen: 牌効率（牌タップ=切る）", () => {
  async function startEfficiency() {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
  }

  it("正解打牌（受け入れ最大）をタップすると正解カウントが増え、次問へ進む", async () => {
    await startEfficiency();
    fireEvent.press(screen.getByRole("button", { name: "9索" }));

    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("正解！")).toBeTruthy();
    await advance(500);
    // seed=1 の Q2 は南(2z)を含む手。
    expect(screen.getByRole("button", { name: "南" })).toBeTruthy();
  });

  it("非正解の牌をタップすると出題数だけ増える（不正解はスキップ扱いで次問へ）", async () => {
    await startEfficiency();
    fireEvent.press(screen.getAllByRole("button", { name: "3萬" })[0]!);

    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText(/不正解/)).toBeTruthy();
    await advance(500);
    expect(screen.getByRole("button", { name: "南" })).toBeTruthy();
  });

  it("回答後は○×のみ表示し、正解打牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startEfficiency();
    fireEvent.press(screen.getAllByRole("button", { name: "3萬" })[0]!);

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（9s/4z/7z）を含め、どの牌にもハイライトを付けない（見直しは結果画面で行う）。
    expect(screen.UNSAFE_queryAllByType(MiniTile).filter((n) => n.props.highlight)).toHaveLength(0);
  });
});

describe("TrainingScreen: 60秒経過と結果画面", () => {
  async function runOneCorrectEfficiency() {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // t=0 で正解（9索）→ t=500 で次問 → 以降は無回答のまま60秒経過（回答中の問題は打ち切り）。
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
  }

  it("60秒経過で finishQuizSession に正しい total/correct が送られ、結果画面と quiz_complete が出る", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500); // 開始から60秒
    await flush();

    expect(mockFinishQuizSession).toHaveBeenCalledTimes(1);
    expect(mockFinishQuizSession).toHaveBeenCalledWith("t", "qs1", {
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
    expect(mockTrackEvent).toHaveBeenCalledWith("quiz_complete", { kind: "efficiency" });
    // 出題は終了している（牌ボタンが無い）。
    expect(screen.queryByRole("button", { name: "南" })).toBeNull();
  });

  it("結果送信に失敗しても結果画面は出し、エラーを小さく表示する", async () => {
    mockFinishQuizSession.mockResolvedValue({ ok: false, status: 404 });
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

    fireEvent.press(screen.getByRole("button", { name: "もう一度" }));
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
  });
});

// seed=1 の出題列（createQuizRng(1) の実測。web の TrainingScreen.test.tsx と同一）:
//   牌効率 Q1: 3m3m5m7m3p5p6p7p8p6s7s9s4z7z → 正解 9s/4z/7z
//   牌効率 Q2: 3m4m4p5p6p8p7s8s9s2z3z3z6z7z → 正解 2z(南)/6z(發)/7z(中)
//   清一色 Q1: 1p2p3p4p4p5p5p5p6p6p7p8p9p → 待ち 4p/5p/6p
//   清一色 Q2: 1s2s3s4s4s5s5s6s6s7s8s8s8s → 待ち 1s/3s/4s/6s/7s/9s
describe("TrainingScreen: 結果画面の見直しリスト", () => {
  /** testID 内の牌ラベル（MiniTile の accessibilityLabel）を表示順で取り出す。 */
  function tilesIn(testID: string): string[] {
    return within(screen.getByTestId(testID))
      .UNSAFE_queryAllByType(MiniTile)
      .map((n) => (n.props as { code: string }).code);
  }

  it("牌効率: 回答した2問が○×・手牌・あなたの回答・正解（bestDiscards 全部）つきで並び、回答中だった問題は含めない", async () => {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    // Q1 を 9索 で正解 → Q2 を 3萬 で不正解 → Q3 は回答中のまま60秒経過。
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.press(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();

    // 回答した2問だけが並ぶ（回答中だった Q3 は含めない）。
    expect(screen.getByTestId("review-row-1")).toBeTruthy();
    expect(screen.getByTestId("review-row-2")).toBeTruthy();
    expect(screen.queryByTestId("review-row-3")).toBeNull();

    // 1問目: ○・手牌14枚・あなたの回答=切った牌・正解=受け入れ最大の打牌（同率全部）。
    expect(within(screen.getByTestId("review-row-1")).getByText(/○/)).toBeTruthy();
    expect(tilesIn("review-hand-1")).toHaveLength(14);
    expect(tilesIn("review-picked-1")).toEqual(["9s"]);
    expect(tilesIn("review-answer-1")).toEqual(["9s", "4z", "7z"]);

    // 2問目: ×・あなたの回答=3萬・正解=南/發/中。
    expect(within(screen.getByTestId("review-row-2")).getByText(/×/)).toBeTruthy();
    expect(tilesIn("review-picked-2")).toEqual(["3m"]);
    expect(tilesIn("review-answer-2")).toEqual(["2z", "6z", "7z"]);
  });

  it("清一色: あなたの回答=選んだ待ち牌・正解=answer の待ち牌が牌で並ぶ", async () => {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();
    // Q1 を 4筒5筒6筒 で正解 → Q2 を 1索 だけ（不完全）で不正解 → Q3 は回答中のまま60秒経過。
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByRole("button", { name: "6筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    fireEvent.press(screen.getByRole("button", { name: "1索" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    await advance(59_000);
    await flush();

    expect(screen.getByTestId("review-row-1")).toBeTruthy();
    expect(screen.getByTestId("review-row-2")).toBeTruthy();
    expect(screen.queryByTestId("review-row-3")).toBeNull();

    expect(within(screen.getByTestId("review-row-1")).getByText(/○/)).toBeTruthy();
    expect(tilesIn("review-hand-1")).toHaveLength(13);
    expect(tilesIn("review-picked-1")).toEqual(["4p", "5p", "6p"]);
    expect(tilesIn("review-answer-1")).toEqual(["4p", "5p", "6p"]);

    expect(within(screen.getByTestId("review-row-2")).getByText(/×/)).toBeTruthy();
    expect(tilesIn("review-picked-2")).toEqual(["1s"]);
    expect(tilesIn("review-answer-2")).toEqual(["1s", "3s", "4s", "6s", "7s", "9s"]);
  });

  it("1問も回答していなければ見直しリスト自体を出さない", async () => {
    render(<TrainingScreen seed={1} />);
    fireEvent.press(screen.getByRole("button", { name: /牌効率/ }));
    await flush();
    await advance(60_000);
    await flush();

    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.queryByText("見直し")).toBeNull();
    expect(screen.queryByTestId("review-row-1")).toBeNull();
  });
});
