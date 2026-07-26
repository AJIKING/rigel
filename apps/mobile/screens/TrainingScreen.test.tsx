import type { QuizKind } from "@rigel/schema";
import type {
  ChinitsuQuestion,
  ChinitsuUkeireQuestion,
  EfficiencyQuestion,
  QuizQuestion,
  ScoreQuestion,
} from "@rigel/ui";
import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { MiniTile } from "../components/MiniTile";
import { TrainingScreen } from "./TrainingScreen";

// ------------------------------------------------------------
// 出題フィクスチャ（generateQuestion 注入口から固定注入する。web の
// TrainingScreen.test.tsx と同一フィクスチャ）。
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
// 清一色 何切る: 1112244557788m（順子が作れない6種・6対子）＋9m の14枚。1向聴で 1m 切りが正解。
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

let mockAuth: { token: string | null; user: { plan: string } | null; loading?: boolean };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockStartQuizSession = jest.fn();
const mockFinishQuizSession = jest.fn();
const mockListQuizSessions = jest.fn();
jest.mock("../lib/api", () => ({
  startQuizSession: (...args: unknown[]) => mockStartQuizSession(...args),
  finishQuizSession: (...args: unknown[]) => mockFinishQuizSession(...args),
  listQuizSessions: (...args: unknown[]) => mockListQuizSessions(...args),
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

/** 直近記録1件を作る（既定: 清一色・10問7正解・JST 7/24 12:05）。 */
function session(over: Record<string, unknown> & { id: string }) {
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
  fireEvent.press(screen.getByRole("button", { name }));
  await flush();
}

/** ダイアログの「開始」→ 3→2→1 のカウントダウン（3秒）を経て第1問まで進める。 */
async function startViaDialog(name: RegExp) {
  await openDialog(name);
  fireEvent.press(screen.getByRole("button", { name: "開始" }));
  await flush();
  await advance(3000);
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockAuth = { token: "t", user: { plan: "free" } };
  mockStartQuizSession.mockResolvedValue({ ok: true, id: "qs1", remainingToday: 2 });
  mockFinishQuizSession.mockResolvedValue({ ok: true, status: 200 });
  mockListQuizSessions.mockResolvedValue([]);
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

  it("認証確認中（loading）は「読み込み中…」を出し、ログイン導線をフラッシュさせない", () => {
    mockAuth = { token: null, user: null, loading: true };
    render(<TrainingScreen />);

    // 文言は web の TrainingScreen と同じ「読み込み中…」。
    expect(screen.getByText("読み込み中…")).toBeTruthy();
    expect(screen.queryByText(/特訓するにはログイン/)).toBeNull();
    expect(screen.queryByText(/清一色 多面待ち/)).toBeNull();
  });

  it.each([{ plan: "free" }, { plan: "next" }])(
    "ログイン中: 3種目のカード＋説明が出る（$plan。無料枠の注記はどのプランでも出さない）",
    ({ plan }) => {
      mockAuth = { token: "t", user: { plan } };
      render(<TrainingScreen />);

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
    },
  );
});

describe("TrainingScreen: 開始ダイアログ（カードタップでは枠を消費しない）", () => {
  it("カードをタップすると開始ダイアログ（種目名＋説明＋直近記録）が出て、開始 API はまだ呼ばれない", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await openDialog(/清一色 多面待ち/);

    const dialog = within(screen.getByTestId("bottom-sheet-card"));
    expect(dialog.getByText("清一色 多面待ち")).toBeTruthy();
    expect(dialog.getByText(/待ち牌を全部見抜く/)).toBeTruthy();
    // ルール一文（[決定] 2026-07-26）: 種目名/説明の近くに1文だけ出す。
    expect(dialog.getByText("60秒でできるだけ多くの問題に答える")).toBeTruthy();
    expect(dialog.getByRole("button", { name: "開始" })).toBeTruthy();
    expect(dialog.getByRole("button", { name: "もどる" })).toBeTruthy();
    // 開始 API は呼ばれない（枠は「開始」を押すまで消費しない）。直近記録だけ取得する。
    expect(mockStartQuizSession).not.toHaveBeenCalled();
    expect(mockListQuizSessions).toHaveBeenCalledWith("t");
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("直近の記録は同じ種目の最新5件だけを「M/D HH:mm ・ 正解 X/Y問 ・ 正答率 Z%」で出す", async () => {
    // 新しい順（API 契約）: 先頭は他種目（efficiency）→ 清一色6件（6件目は溢れて出さない）。
    mockListQuizSessions.mockResolvedValue([
      session({ id: "e1", kind: "efficiency", createdAt: "2026-07-24T05:00:00.000Z" }),
      session({ id: "c1", createdAt: "2026-07-24T03:05:00.000Z", correct: 7, total: 10 }),
      session({ id: "c2", createdAt: "2026-07-23T10:00:00.000Z", correct: 5, total: 8 }),
      session({ id: "c3", createdAt: "2026-07-22T00:30:00.000Z", correct: 9, total: 12 }),
      session({ id: "c4", createdAt: "2026-07-21T02:00:00.000Z", correct: 3, total: 9 }),
      session({ id: "c5", createdAt: "2026-07-20T01:00:00.000Z", correct: 10, total: 10 }),
      session({ id: "c6", createdAt: "2026-07-19T01:00:00.000Z", correct: 1, total: 10 }),
    ]);
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await openDialog(/清一色 多面待ち/);

    const dialog = within(screen.getByTestId("bottom-sheet-card"));
    for (const line of [
      "7/24 12:05 ・ 正解 7/10問 ・ 正答率 70%",
      "7/23 19:00 ・ 正解 5/8問 ・ 正答率 63%",
      "7/22 09:30 ・ 正解 9/12問 ・ 正答率 75%",
      "7/21 11:00 ・ 正解 3/9問 ・ 正答率 33%",
      "7/20 10:00 ・ 正解 10/10問 ・ 正答率 100%",
    ]) {
      expect(dialog.getByText(line)).toBeTruthy();
    }
    // 他種目（7/24 14:00 の牌効率）と6件目（7/19）は出さない。
    expect(dialog.queryByText(/7\/24 14:00/)).toBeNull();
    expect(dialog.queryByText(/7\/19/)).toBeNull();
  });

  it("記録が無ければ「まだ特訓の記録がありません」を出す", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await openDialog(/清一色 多面待ち/);

    expect(
      within(screen.getByTestId("bottom-sheet-card")).getByText("まだ特訓の記録がありません"),
    ).toBeTruthy();
  });

  it("「もどる」でダイアログが閉じ、開始 API は呼ばれないまま種目選択に戻る", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await openDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "もどる" }));

    expect(screen.queryByTestId("bottom-sheet-card")).toBeNull();
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(mockStartQuizSession).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("「開始」で開始 API（枠消費）と quiz_start が走り、3→2→1 のカウントダウン後に第1問と60秒タイマーが始まる", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />); // 清一色 Q1 フィクスチャ = 筒子13枚・待ち 4p/5p/6p（固定注入）
    await openDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "開始" }));
    await flush();

    expect(mockStartQuizSession).toHaveBeenCalledWith("t", "chinitsu");
    expect(mockTrackEvent).toHaveBeenCalledWith("quiz_start", { kind: "chinitsu" });
    // ダイアログは閉じ、カウントダウン「3」（この間は牌も残り秒も見せない）。
    expect(screen.queryByTestId("bottom-sheet-card")).toBeNull();
    expect(within(screen.getByTestId("countdown")).getByText("3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "1筒" })).toBeNull();
    expect(screen.queryByText(/残り/)).toBeNull();
    await advance(1000);
    expect(within(screen.getByTestId("countdown")).getByText("2")).toBeTruthy();
    await advance(1000);
    expect(within(screen.getByTestId("countdown")).getByText("1")).toBeTruthy();
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
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await openDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "開始" }));
    await flush();
    await advance(3000); // カウントダウン3秒ぶん

    expect(screen.getByText("残り 60秒")).toBeTruthy();
  });

  it("402（無料枠の使い切り）はダイアログ内に上限メッセージと導線を出し、カウントダウンもセッションも始まらない", async () => {
    const onOpenSettings = jest.fn();
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    render(<TrainingScreen generateQuestion={fixtureGenerate()} onOpenSettings={onOpenSettings} />);
    await openDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "開始" }));
    await flush();

    const dialog = within(screen.getByTestId("bottom-sheet-card"));
    expect(
      dialog.getByText("本日の無料枠（3回）を使い切りました。有料プランなら無制限です。"),
    ).toBeTruthy();
    // アップグレード導線: 押すとプラン変更 UI のある設定タブへ（HomeTabs が配線）。
    fireEvent.press(dialog.getByRole("button", { name: "プランをアップグレード" }));
    expect(onOpenSettings).toHaveBeenCalled();
    // カウントダウンもセッションも始まらない（quiz_start も送らない）。
    await advance(3000);
    expect(screen.queryByTestId("countdown")).toBeNull();
    expect(screen.queryByText(/残り/)).toBeNull();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("token 失効（user はいるが token が無い）でカードをタップすると再ログインを促し、ダイアログも開始 API も無し（沈黙しない）", async () => {
    mockAuth = { token: null, user: { plan: "free" } };
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    fireEvent.press(screen.getByRole("button", { name: /清一色 多面待ち/ }));
    await flush();

    expect(screen.getByText("ログインが必要です。再度ログインしてください。")).toBeTruthy();
    expect(screen.queryByTestId("bottom-sheet-card")).toBeNull();
    expect(mockStartQuizSession).not.toHaveBeenCalled();
    expect(mockListQuizSessions).not.toHaveBeenCalled();
    expect(screen.queryByText(/残り \d+秒/)).toBeNull();
  });

  it("その他の開始エラー（500）はダイアログ内に汎用文言を出し、アップグレード導線は出さない", async () => {
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 500 });
    render(<TrainingScreen generateQuestion={fixtureGenerate()} onOpenSettings={jest.fn()} />);
    await openDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "開始" }));
    await flush();

    const dialog = within(screen.getByTestId("bottom-sheet-card"));
    expect(dialog.getByText(/開始できませんでした/)).toBeTruthy();
    expect(dialog.queryByRole("button", { name: "プランをアップグレード" })).toBeNull();
  });
});

// 出題は CHINITSU_QS / EFFICIENCY_QS フィクスチャの固定注入（ファイル冒頭参照）。
describe("TrainingScreen: 清一色（待ち牌の複数選択・完全一致）", () => {
  async function startChinitsu() {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/清一色 多面待ち/);
  }

  it("待ち牌を全部選んで回答すると正解カウントが増え、0.5秒後に次問へ進む", async () => {
    await startChinitsu();
    // 出題指示文は最短（補足は種目選択カードの説明に寄せた）。
    expect(screen.getByText("待ち牌を全部選ぶ")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByRole("button", { name: "6筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

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
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText("× 不正解")).toBeTruthy();
  });

  it("フィードバック帯: 回答受付中も固定スロット（空）が存在し、回答直後だけ○/×が入り0.5秒後に空へ戻る（レイアウトシフトなし・牌に被せない）", async () => {
    await startChinitsu();
    // 回答前: 帯スロットは空のまま存在する（高さ固定でレイアウトシフトを起こさない）。
    expect(within(screen.getByTestId("feedback-band")).queryByText(/正解/)).toBeNull();
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));
    // 回答直後: 帯に不正解の文言（最短）。
    expect(within(screen.getByTestId("feedback-band")).getByText("× 不正解")).toBeTruthy();
    // 0.5秒後: 次問と同時に空へ戻る（帯スロット自体は残る）。
    await advance(500);
    expect(within(screen.getByTestId("feedback-band")).queryByText(/正解/)).toBeNull();
  });

  it("フィードバック帯は live region（polite）でスクリーンリーダーに正誤が読まれる", async () => {
    await startChinitsu();
    // 帯自体に付ける（回答直後に差し込まれる○×テキストが自動で読み上げられる）。
    expect(screen.getByTestId("feedback-band").props.accessibilityLiveRegion).toBe("polite");
  });

  it("回答後は○×のみ表示し、正解の待ち牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startChinitsu();
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（4p/5p/6p）を含め、どの牌にもハイライトを付けない（見直しは結果画面で行う）。
    expect(screen.UNSAFE_queryAllByType(MiniTile).filter((n) => n.props.highlight)).toHaveLength(0);
  });

  it("候補牌（34×47）は hitSlop でタップ領域を 44pt 以上に広げる（見た目は変えない）", async () => {
    await startChinitsu();
    // 34+5+5=44 / 47+6+6=59。隣の牌と反応領域が重ならない最小の広げ方。
    expect(screen.getByRole("button", { name: "1筒" }).props.hitSlop).toEqual({
      top: 6,
      bottom: 6,
      left: 5,
      right: 5,
    });
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
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
  }

  it("正解打牌（受け入れ最大）をタップすると正解カウントが増え、次問へ進む", async () => {
    await startEfficiency();
    // 出題指示文は最短（同率ルールは種目選択カードの説明に寄せた）。
    expect(screen.getByText("受け入れ最大の牌を切る")).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "9索" }));

    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
    await advance(500);
    // フィクスチャ Q2 は南(2z)を含む手。
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

  it("手牌の打牌ボタン（34×47）は hitSlop でタップ領域を 44pt 以上に広げる（見た目は変えない）", async () => {
    await startEfficiency();
    expect(screen.getByRole("button", { name: "9索" }).props.hitSlop).toEqual({
      top: 6,
      bottom: 6,
      left: 5,
      right: 5,
    });
  });

  it("回答後は○×のみ表示し、正解打牌をハイライトしない（セッション中は正答を見せない）", async () => {
    await startEfficiency();
    fireEvent.press(screen.getAllByRole("button", { name: "3萬" })[0]!);

    expect(screen.getByText(/不正解/)).toBeTruthy();
    // 正解（9s/4z/7z）を含め、どの牌にもハイライトを付けない（見直しは結果画面で行う）。
    expect(screen.UNSAFE_queryAllByType(MiniTile).filter((n) => n.props.highlight)).toHaveLength(0);
  });
});

// 出題は SCORE_QS フィクスチャの固定注入（Q1=門前リーチ・Q2=副露入り。ファイル冒頭参照）。
describe("TrainingScreen: 点数計算（4択・牌姿ベース v2）", () => {
  async function startScore() {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/点数計算/);
  }

  /** testID 内の牌コード（MiniTile の code）を表示順で取り出す。 */
  function tilesIn(testID: string): string[] {
    return within(screen.getByTestId(testID))
      .UNSAFE_queryAllByType(MiniTile)
      .map((n) => (n.props as { code: string }).code);
  }

  it("条件ラベル（リーチ入り）・ドラ表示・牌姿（手牌+和了牌）・選択肢4ボタンが出る（翻数・符は見せない）", async () => {
    await startScore();
    expect(screen.getByText("点数を選ぶ")).toBeTruthy();
    // 親か子か＋リーチの有無は点数計算の本質なのでラベルに明示する（リーチはツモ/ロンの前）。
    expect(screen.getByText("親（東家）・リーチ・ロン・場風 東")).toBeTruthy();
    // ドラ表示牌（小ラベル+牌1枚）。
    expect(screen.getByText("ドラ表示")).toBeTruthy();
    expect(tilesIn("score-dora")).toEqual(["5z"]);
    // 手牌は門前部分から和了牌1枚を除いた13枚。和了牌は分けて強調し、ツモ/ロンのバッジを添える。
    // prettier-ignore
    expect(tilesIn("score-hand")).toEqual(["4m", "5m", "6m", "1p", "1p", "1p", "5p", "5p", "1s", "1s", "2s", "2s", "3s"]);
    expect(tilesIn("score-win")).toEqual(["3s"]);
    expect(within(screen.getByTestId("score-win")).getByText("ロン")).toBeTruthy();
    // Q1 は門前（副露なし）。
    expect(screen.queryByTestId("score-meld-0")).toBeNull();
    for (const c of ["7700点", "3900点", "4800点", "2600点"]) {
      expect(screen.getByRole("button", { name: c })).toBeTruthy();
    }
    // 翻数・符は表示しない（自分で数えるのが問題）。
    expect(screen.queryByText(/2翻40符/)).toBeNull();
  });

  it("正解の選択肢をタップすると正解カウントが増え、0.5秒後に次問（副露入り）へ進む", async () => {
    await startScore();
    fireEvent.press(screen.getByRole("button", { name: "3900点" }));
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(screen.getByText("○ 正解")).toBeTruthy();
    await advance(500);
    // 次問（Q2）: 親（東家）・ポン+チー入り（リーチなし → ラベルにリーチを含めない）。
    // 副露は scoreMeldViews（meldTileViews 流用）で表示。
    expect(screen.getByText("親（東家）・ロン・場風 東")).toBeTruthy();
    expect(screen.queryByText(/リーチ/)).toBeNull();
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
    expect(tilesIn("score-hand")).toEqual(["2s", "4s", "6s", "7s", "8s", "6z", "6z"]);
    expect(tilesIn("score-meld-0")).toEqual(["7z", "7z", "7z"]);
    expect(tilesIn("score-meld-1")).toEqual(["5s", "6s", "7s"]);
    expect(tilesIn("score-win")).toEqual(["3s"]);
    expect(within(screen.getByTestId("score-win")).getByText("ロン")).toBeTruthy();
    expect(tilesIn("score-dora")).toEqual(["2s"]);
  });

  it("不正解の選択肢は出題数だけ増える（スキップ扱いで次問へ）", async () => {
    await startScore();
    fireEvent.press(screen.getByRole("button", { name: "7700点" }));
    expect(screen.getByText("正解 0 / 1問")).toBeTruthy();
    expect(screen.getByText("× 不正解")).toBeTruthy();
  });

  it("結果画面の見直しリスト: 条件（リーチ入り）・ドラ表示・牌姿・あなたの回答・正解・役の内訳が並ぶ", async () => {
    await startScore();
    // Q1 を正解（3900点）→ Q2 を不正解（3900点オール）→ 60秒経過。
    fireEvent.press(screen.getByRole("button", { name: "3900点" }));
    await advance(500);
    fireEvent.press(screen.getByRole("button", { name: "3900点オール" }));
    await advance(500);
    await advance(59_000);
    await flush();

    expect(mockFinishQuizSession).toHaveBeenCalledWith("t", "qs1", {
      kind: "score",
      total: 2,
      correct: 1,
      durationMs: 60_000,
    });
    // 1問目: ○・条件（リーチ入り）・ドラ表示・牌姿（手牌13+上がり1）・回答/正解＋役の内訳
    //（立直 1翻 が scoreYakuLine 経由で並ぶ）。
    const row1 = within(screen.getByTestId("review-row-1"));
    expect(row1.getByText(/○/)).toBeTruthy();
    expect(row1.getByText("親（東家）・リーチ・ロン・場風 東")).toBeTruthy();
    expect(tilesIn("review-dora-1")).toEqual(["5z"]);
    // prettier-ignore
    expect(tilesIn("review-hand-1")).toEqual(["4m", "5m", "6m", "1p", "1p", "1p", "5p", "5p", "1s", "1s", "2s", "2s", "3s", "3s"]);
    // あなたの回答と正解が同じ文字列（正解した問題）。
    expect(row1.getAllByText("3900点")).toHaveLength(2);
    // 役の内訳（練習サイトの解説に相当）。
    expect(row1.getByText("立直 1翻・一盃口 1翻・計2翻40符")).toBeTruthy();

    // 2問目: ×・副露（ポン+チー）込みの牌姿14枚・あなたの回答=3900点オール・正解=11600点＋役の内訳。
    const row2 = within(screen.getByTestId("review-row-2"));
    expect(row2.getByText(/×/)).toBeTruthy();
    expect(row2.getByText("親（東家）・ロン・場風 東")).toBeTruthy();
    expect(tilesIn("review-dora-2")).toEqual(["2s"]);
    // prettier-ignore
    expect(tilesIn("review-hand-2")).toEqual(["2s", "4s", "6s", "7s", "8s", "6z", "6z", "7z", "7z", "7z", "5s", "6s", "7s", "3s"]);
    expect(row2.getByText("3900点オール")).toBeTruthy();
    expect(row2.getByText("11600点")).toBeTruthy();
    expect(row2.getByText("役牌 中 1翻・混一色 2翻・ドラ1・計4翻30符")).toBeTruthy();
    // 受け入れ詳細（牌効率専用）は出さない。
    expect(row1.queryByText(/受け入れ/)).toBeNull();
  });
});

describe("TrainingScreen: 60秒経過と結果画面", () => {
  async function runOneCorrectEfficiency() {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
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
    // 結果画面（正解数・出題数・正答率。60秒固定なので「1分あたり」は出さない＝意味の重複を避ける）。
    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.getByText("正解 1問")).toBeTruthy();
    expect(screen.getByText("出題 1問")).toBeTruthy();
    expect(screen.getByText("正答率 100%")).toBeTruthy();
    expect(screen.queryByText(/1分あたり/)).toBeNull();
    // 残り回数（今日あと◯回）は結果画面にも出さない（[決定] 2026-07-25 オーナーレビュー）。
    expect(screen.queryByText(/今日あと/)).toBeNull();
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
    expect(screen.getByText("正解 1問")).toBeTruthy();
    // エラーは敬体＋影響（この挑戦は記録に残らない）まで伝える。
    expect(screen.getByText("結果の送信に失敗しました。この挑戦は記録に残りません。")).toBeTruthy();
  });

  it("前セッションの結果送信が遅れて失敗しても、新しいセッションにエラーを混入させない（sessionId 一致ガード）", async () => {
    // セッション1（qs1）の送信は保留にし、セッション2（qs2）開始後に失敗させる。
    let settleFirst!: (v: { ok: boolean; status: number }) => void;
    mockStartQuizSession
      .mockResolvedValueOnce({ ok: true, id: "qs1", remainingToday: 2 })
      .mockResolvedValueOnce({ ok: true, id: "qs2", remainingToday: 1 });
    mockFinishQuizSession.mockImplementationOnce(
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
    fireEvent.press(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    await advance(3000);
    settleFirst({ ok: false, status: 500 });
    await flush();

    // qs2 を無回答で終える（qs2 の送信は成功）→ qs1 の遅延失敗は表示に混入しない。
    await advance(60_000);
    await flush();
    expect(screen.getByText("結果")).toBeTruthy();
    expect(mockFinishQuizSession).toHaveBeenLastCalledWith(
      "t",
      "qs2",
      expect.objectContaining({ durationMs: 60_000 }),
    );
    expect(screen.queryByText(/結果の送信に失敗しました/)).toBeNull();
  });

  it("「もう一度挑戦」は同じ種目で開始 API を再度呼び、カウントダウンを経て新しいセッションが始まる", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(mockStartQuizSession).toHaveBeenCalledTimes(2);
    expect(mockStartQuizSession).toHaveBeenLastCalledWith("t", "efficiency");
    // 結果画面は閉じ、初回開始と同じ 3→2→1 のカウントダウンから始まる。
    expect(screen.queryByText("結果")).toBeNull();
    expect(within(screen.getByTestId("countdown")).getByText("3")).toBeTruthy();
    await advance(3000);
    // 新しいセッション: スコアはリセット・残り60秒から。
    expect(screen.getByText("残り 60秒")).toBeTruthy();
    expect(screen.getByText("正解 0 / 0問")).toBeTruthy();
  });

  it("「もう一度挑戦」が402なら結果画面のまま上限メッセージとアップグレード導線を出す", async () => {
    const onOpenSettings = jest.fn();
    mockStartQuizSession.mockResolvedValueOnce({ ok: true, id: "qs1", remainingToday: 2 });
    render(<TrainingScreen generateQuestion={fixtureGenerate()} onOpenSettings={onOpenSettings} />);
    await startViaDialog(/牌効率/);
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    await advance(59_500);
    await flush();
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 402, reason: "quota" });

    fireEvent.press(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    // セッションは始まらず、結果画面の上でメッセージと導線を出す。
    expect(screen.getByText("結果")).toBeTruthy();
    expect(
      screen.getByText("本日の無料枠（3回）を使い切りました。有料プランなら無制限です。"),
    ).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "プランをアップグレード" }));
    expect(onOpenSettings).toHaveBeenCalled();
    expect(screen.queryByText(/残り \d+秒/)).toBeNull();
  });

  it("「問題選択にもどる」で種目選択に戻れる（開始 API は呼ばれない）", async () => {
    await runOneCorrectEfficiency();
    await advance(59_500);
    await flush();

    fireEvent.press(screen.getByRole("button", { name: "問題選択にもどる" }));
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(mockStartQuizSession).toHaveBeenCalledTimes(1);
  });

  it("「もう一度挑戦」の402後に「問題選択にもどる」と、上限メッセージと導線を選択画面へ持ち越さない", async () => {
    const onOpenSettings = jest.fn();
    render(<TrainingScreen generateQuestion={fixtureGenerate()} onOpenSettings={onOpenSettings} />);
    await startViaDialog(/牌効率/);
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    await advance(59_500);
    await flush();
    mockStartQuizSession.mockResolvedValue({ ok: false, status: 402, reason: "quota" });
    fireEvent.press(screen.getByRole("button", { name: "もう一度挑戦" }));
    await flush();
    expect(screen.getByText(/本日の無料枠/)).toBeTruthy();

    fireEvent.press(screen.getByRole("button", { name: "問題選択にもどる" }));
    // 選択画面: エラーは消える（上限はプランカードで伝える方針。貼り付いたままにしない）。
    expect(screen.getByRole("button", { name: /清一色 多面待ち/ })).toBeTruthy();
    expect(screen.queryByText(/本日の無料枠/)).toBeNull();
    expect(screen.queryByRole("button", { name: "プランをアップグレード" })).toBeNull();
  });
});

// 出題はフィクスチャの固定注入（ファイル冒頭参照）。受け入れ詳細の期待値
// （4種16枚・10種34枚・14種48枚・向聴戻し）は同じ手に対する @rigel/ui の
// ukeireReviewModel / discardUkeires のテストと同一ルールで計算される実値。
describe("TrainingScreen: 結果画面の見直しリスト", () => {
  /** testID 内の牌ラベル（MiniTile の accessibilityLabel）を表示順で取り出す。 */
  function tilesIn(testID: string): string[] {
    return within(screen.getByTestId(testID))
      .UNSAFE_queryAllByType(MiniTile)
      .map((n) => (n.props as { code: string }).code);
  }

  it("牌効率: 回答した2問が○×・手牌・あなたの回答・正解（bestDiscards 全部）つきで並び、回答中だった問題は含めない", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
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
    // 見出しテキスト「見直し」は出さない（リストを直接置く [決定] 2026-07-25 オーナーレビュー）。
    expect(screen.queryByText("見直し")).toBeNull();

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

  it("見直し行は「番号＋○×」のヘッダ行に続き、問題も「ラベル＋牌列」で回答・正解と同じ並びになる", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    await advance(59_500);
    await flush();

    const row = within(screen.getByTestId("review-row-1"));
    // 問題にもラベルが付く（あなたの回答・正解と同じ「ラベル＋牌列」の行）。
    expect(row.getByText("問題")).toBeTruthy();
    expect(row.getByText("あなたの回答")).toBeTruthy();
    expect(row.getByText("正解")).toBeTruthy();
  });

  it("清一色: あなたの回答=選んだ待ち牌・正解=answer の待ち牌が牌で並ぶ", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/清一色 多面待ち/);
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

  // 受け入れ詳細の期待値は @rigel/ui の discardUkeires を一時プローブで実測し検算済み
  // （web の TrainingScreen.test.tsx と同一の焼き付け値）:
  //   Q1: 最小向聴2。9s/4z/7z 切り → 受け入れ 4種16枚(6m,4p,5s,8s)。
  //   Q2: 最小向聴2。2z/6z/7z 切り → 受け入れ 10種34枚。3m 切りは 3向聴（向聴戻し）→ 14種48枚。
  it("牌効率: 見直し行に受け入れ詳細（あなたの回答の種類・枚数・向聴戻し / 正解各打牌の受け入れ）が出る", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
    // Q1 を 9索（正解・向聴維持）→ Q2 を 3萬（不正解・向聴戻し）で回答して60秒経過。
    fireEvent.press(screen.getByRole("button", { name: "9索" }));
    await advance(500);
    fireEvent.press(screen.getByRole("button", { name: "3萬" }));
    await advance(500);
    await advance(59_000);
    await flush();

    // 1問目: あなたの回答（9索）は最小向聴を保つ → バッジ無し・受け入れ 4種16枚。
    const mine1 = screen.getByTestId("review-ukeire-mine-1");
    expect(within(mine1).getByText("受け入れ 4種16枚")).toBeTruthy();
    expect(tilesIn("review-ukeire-mine-1")).toEqual(["6m", "4p", "5s", "8s"]);
    expect(within(screen.getByTestId("review-row-1")).queryByText("向聴戻し")).toBeNull();
    // 正解（9s/4z/7z）ごとに受け入れ行が並ぶ（あなたの回答と重複表示してよい）。
    for (const d of ["9s", "4z", "7z"]) {
      const g = screen.getByTestId(`review-ukeire-best-1-${d}`);
      expect(within(g).getByText("受け入れ 4種16枚")).toBeTruthy();
      expect(tilesIn(`review-ukeire-best-1-${d}`)).toEqual(["6m", "4p", "5s", "8s"]);
    }

    // 2問目: あなたの回答（3萬）は向聴戻し（2→3向聴）→ バッジ・受け入れ 14種48枚。
    const mine2 = screen.getByTestId("review-ukeire-mine-2");
    expect(within(mine2).getByText("向聴戻し")).toBeTruthy();
    expect(within(mine2).getByText("受け入れ 14種48枚")).toBeTruthy();
    expect(tilesIn("review-ukeire-mine-2")).toEqual(
      // prettier-ignore
      ["2m", "3m", "4m", "5m", "6m", "3p", "6p", "7p", "8p", "9p", "2z", "3z", "6z", "7z"],
    );
    // 正解（2z/6z/7z）の各受け入れ（10種34枚。切った字牌だけが互いに入れ替わる）。
    const expected2: ReadonlyArray<[string, string[]]> = [
      ["2z", ["2m", "5m", "3p", "6p", "7p", "8p", "9p", "3z", "6z", "7z"]],
      ["6z", ["2m", "5m", "3p", "6p", "7p", "8p", "9p", "2z", "3z", "7z"]],
      ["7z", ["2m", "5m", "3p", "6p", "7p", "8p", "9p", "2z", "3z", "6z"]],
    ];
    for (const [d, tiles] of expected2) {
      const g = screen.getByTestId(`review-ukeire-best-2-${d}`);
      expect(within(g).getByText("受け入れ 10種34枚")).toBeTruthy();
      expect(tilesIn(`review-ukeire-best-2-${d}`)).toEqual(tiles);
    }
  });

  it("清一色: 見直し行に受け入れ詳細を出さない（待ち牌の比較のみで現状維持）", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/清一色 多面待ち/);
    fireEvent.press(screen.getByRole("button", { name: "4筒" }));
    fireEvent.press(screen.getByRole("button", { name: "回答" }));
    await advance(500);
    await advance(59_500);
    await flush();

    expect(screen.queryByTestId("review-ukeire-mine-1")).toBeNull();
    expect(within(screen.getByTestId("review-row-1")).queryByText(/受け入れ/)).toBeNull();
  });

  it("1問も回答していなければ見直しリスト自体を出さない", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/牌効率/);
    await advance(60_000);
    await flush();

    expect(screen.getByText("結果")).toBeTruthy();
    expect(screen.queryByText("見直し")).toBeNull();
    expect(screen.queryByTestId("review-row-1")).toBeNull();
  });
});

describe("TrainingScreen: 清一色 何切る（牌タップ=切る・広さ最大）", () => {
  it("指示文は種目のもので、正解打牌で正解カウントが増える", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/清一色 何切る/);

    expect(screen.getByText("一番広くなる牌を切る")).toBeTruthy();
    expect(screen.queryByText("受け入れ最大の牌を切る")).toBeNull();

    fireEvent.press(screen.getAllByLabelText("1萬")[0]!);
    expect(screen.getByText("正解 1 / 1問")).toBeTruthy();
  });

  it("見直し行に受け入れ詳細が出る（同色だけで広さを測る）", async () => {
    render(<TrainingScreen generateQuestion={fixtureGenerate()} />);
    await startViaDialog(/清一色 何切る/);
    fireEvent.press(screen.getAllByLabelText("1萬")[0]!);
    await advance(500);
    await advance(59_500);

    expect(screen.getByTestId("review-ukeire-mine-1")).toBeTruthy();
  });
});
