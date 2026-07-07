import { ProblemSchema, type Problem } from "@rigel/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { makeOpponentHandsProblem, makePost } from "./problem-test-helpers";
import { ProblemEditScreen } from "./ProblemEditScreen";

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockParams: { problemId?: string } | undefined;
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockParams }),
}));

let mockAuth: { token: string | null; user: { plan: string } | null };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockGetProblem = jest.fn();
const mockCreateProblem = jest.fn();
const mockUpdateProblem = jest.fn();
jest.mock("../lib/api", () => ({
  getProblem: (...args: unknown[]) => mockGetProblem(...args),
  createProblem: (...args: unknown[]) => mockCreateProblem(...args),
  updateProblem: (...args: unknown[]) => mockUpdateProblem(...args),
}));

/** 手牌13枚（1-9萬 + 1-4筒）をピッカーで入力する（開いたまま連続入力→閉じる）。 */
function inputFullHand() {
  fireEvent.press(screen.getByLabelText("手牌に追加"));
  for (const label of ["1萬", "2萬", "3萬", "4萬", "5萬", "6萬", "7萬", "8萬", "9萬"]) {
    fireEvent.press(screen.getByLabelText(label));
  }
  fireEvent.press(screen.getByText("筒")); // スートタブ切替
  for (const label of ["1筒", "2筒", "3筒", "4筒"]) {
    fireEvent.press(screen.getByLabelText(label));
  }
  fireEvent.press(screen.getByText("閉じる"));
}

/** ツモ牌に5筒を選ぶ（選択で自動クローズ）。 */
function inputDrawn5p() {
  fireEvent.press(screen.getByLabelText("ツモ牌を選ぶ"));
  fireEvent.press(screen.getByText("筒"));
  fireEvent.press(screen.getByLabelText("5筒"));
}

describe("ProblemEditScreen（何切る問題の作成/編集）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
    mockParams = undefined;
  });

  it("13枚+ツモ+コメントを入れて公開保存すると、答えを持たない problem が createProblem に渡る", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);

    // 正解は設けない（答え入力の UI 自体が無い）。
    expect(screen.queryByText("出題者の答え")).toBeNull();

    fireEvent.changeText(screen.getByLabelText("タイトル"), "テスト作成");
    inputFullHand();
    inputDrawn5p();
    fireEvent.changeText(
      screen.getByLabelText("出題者のコメント（任意。回答後に表示されます）"),
      "テストコメント",
    );

    fireEvent.press(screen.getByText("公開して保存"));

    await waitFor(() => expect(mockCreateProblem).toHaveBeenCalledTimes(1));
    const [token, input] = mockCreateProblem.mock.calls[0] as [
      string,
      { title: string; problem: Problem; status: string },
    ];
    expect(token).toBe("t");
    expect(input.title).toBe("テスト作成");
    expect(input.status).toBe("published");
    // スキーマの単一真実源で再検証（クライアント検証済みのものが渡る）。
    expect(() => ProblemSchema.parse(input.problem)).not.toThrow();
    expect(input.problem.seats.east.hand).toHaveLength(13);
    expect(input.problem.drawn).toBe("5p");
    expect("answer" in input.problem).toBe(false); // 正解は設けない
    expect(input.problem.explanation).toBe("テストコメント");
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });

  it("手牌が13枚に足りないと保存せずエラー文言（13枚）を出す", async () => {
    render(<ProblemEditScreen />);

    fireEvent.press(screen.getByLabelText("手牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));
    inputDrawn5p();

    fireEvent.press(screen.getByText("下書き保存"));

    // 見出し「手牌（1/13枚）」ではなくスキーマ由来のエラー文言そのもの。
    expect(await screen.findByText("手牌は副露3枚換算で13枚にする")).toBeTruthy();
    expect(mockCreateProblem).not.toHaveBeenCalled();
  });

  it("上限超過（403）は LIMIT_MESSAGES.problems を表示する", async () => {
    mockCreateProblem.mockResolvedValue({ ok: false, status: 403 });
    render(<ProblemEditScreen />);

    inputFullHand();
    inputDrawn5p();
    fireEvent.press(screen.getByText("公開して保存"));

    expect(await screen.findByText(/無料プランの何切る問題は20問まで/)).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("盤面プレビューは既定で表示され、折りたたみできる", () => {
    render(<ProblemEditScreen />);
    // 既定 open：卓中央に場風+巡目（既定=東場・6巡目）が出る。
    expect(screen.getByText("東場 6巡目")).toBeTruthy();
    fireEvent.press(screen.getByText(/プレビュー/));
    expect(screen.queryByText("東場 6巡目")).toBeNull();
  });

  it("problemId 付きは既存の問題を読み込み、保存で updateProblem を呼ぶ", async () => {
    mockParams = { problemId: "p1" };
    mockGetProblem.mockResolvedValue(makePost({ id: "p1", title: "既存の問題" }));
    mockUpdateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);

    expect(await screen.findByDisplayValue("既存の問題")).toBeTruthy();
    fireEvent.press(screen.getByText("下書き保存"));

    await waitFor(() => expect(mockUpdateProblem).toHaveBeenCalledTimes(1));
    const [token, id, input] = mockUpdateProblem.mock.calls[0] as [
      string,
      string,
      { title: string; problem: Problem; status: string },
    ];
    expect(token).toBe("t");
    expect(id).toBe("p1");
    expect(input.status).toBe("draft");
    expect(() => ProblemSchema.parse(input.problem)).not.toThrow();
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });
});

describe("ProblemEditScreen: 相手の手牌（出題オプション）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
    mockParams = undefined;
  });

  it("既定はOFF（他家の手牌の入力先が出ない）。ONにすると注記と3席分の入力先が現れ、置いた牌はチップで外せる", () => {
    render(<ProblemEditScreen />);
    expect(screen.queryByLabelText("南家の手牌に追加")).toBeNull();
    expect(screen.queryByText("設定した席の手牌は回答者に見えます。")).toBeNull();

    fireEvent.press(screen.getByText("相手の手牌も設定する"));
    expect(screen.getByText("設定した席の手牌は回答者に見えます。")).toBeTruthy();
    // pov=東（既定）なので入力先は南・西・北の3席のみ。
    expect(screen.getByLabelText("西家の手牌に追加")).toBeTruthy();
    expect(screen.getByLabelText("北家の手牌に追加")).toBeTruthy();
    expect(screen.queryByLabelText("東家の手牌に追加")).toBeNull();

    fireEvent.press(screen.getByLabelText("南家の手牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));
    // 入力済みチップ（タップで1枚外す）。
    fireEvent.press(screen.getByLabelText("南家の手牌の 1萬 を外す"));
    expect(screen.queryByLabelText("南家の手牌の 1萬 を外す")).toBeNull();
  });

  it("OFFに戻すと他家の手牌はクリアされ、開いていた他家手牌のピッカーも閉じる", () => {
    render(<ProblemEditScreen />);
    fireEvent.press(screen.getByText("相手の手牌も設定する")); // ON
    fireEvent.press(screen.getByLabelText("南家の手牌に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("相手の手牌も設定する")); // OFF（ピッカーは開いたまま）

    expect(screen.queryByText("閉じる")).toBeNull(); // ピッカーが閉じる
    expect(screen.queryByLabelText("南家の手牌に追加")).toBeNull();
    // 再度ONにしても前の入力は残っていない（クリア済み）。
    fireEvent.press(screen.getByText("相手の手牌も設定する"));
    expect(screen.queryByLabelText("南家の手牌の 1萬 を外す")).toBeNull();
  });

  it("ONで置いた他家の手牌が problem に写って保存される（OFF相当の席は空のまま）", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);
    inputFullHand();
    inputDrawn5p();

    fireEvent.press(screen.getByText("相手の手牌も設定する"));
    fireEvent.press(screen.getByLabelText("南家の手牌に追加"));
    // pov の手牌（1-9萬+1-4筒）とラベルが重複しない牌で13枚（6-9筒 + 1-9索）。
    fireEvent.press(screen.getByText("筒"));
    for (const label of ["6筒", "7筒", "8筒", "9筒"]) {
      fireEvent.press(screen.getByLabelText(label));
    }
    fireEvent.press(screen.getByText("索"));
    for (const label of ["1索", "2索", "3索", "4索", "5索", "6索", "7索", "8索", "9索"]) {
      fireEvent.press(screen.getByLabelText(label));
    }
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("公開して保存"));
    await waitFor(() => expect(mockCreateProblem).toHaveBeenCalledTimes(1));
    const [, input] = mockCreateProblem.mock.calls[0] as [string, { problem: Problem }];
    expect(() => ProblemSchema.parse(input.problem)).not.toThrow();
    expect(input.problem.seats.south.hand).toHaveLength(13);
    expect(input.problem.seats.west.hand).toHaveLength(0);
    expect(input.problem.seats.north.hand).toHaveLength(0);
  });

  it("他家に手牌がある既存問題はONで初期化され、チップが表示される", async () => {
    mockParams = { problemId: "p1" };
    mockGetProblem.mockResolvedValue(makePost({ id: "p1", problem: makeOpponentHandsProblem() }));
    render(<ProblemEditScreen />);

    expect(await screen.findByText("設定した席の手牌は回答者に見えます。")).toBeTruthy();
    expect(screen.getByLabelText("南家の手牌の 2索 を外す")).toBeTruthy();
  });
});
