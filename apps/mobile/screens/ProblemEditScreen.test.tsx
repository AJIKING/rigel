import { ProblemSchema, type Problem } from "@rigel/schema";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { makePost } from "./problem-test-helpers";
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

/** 手牌13枚を入力し、ピッカーは開いたままにする（13枚目で入力先の自動切替を観察する用）。 */
function inputFullHandKeepOpen() {
  fireEvent.press(screen.getByLabelText("手牌に追加"));
  for (const label of ["1萬", "2萬", "3萬", "4萬", "5萬", "6萬", "7萬", "8萬", "9萬"]) {
    fireEvent.press(screen.getByLabelText(label));
  }
  fireEvent.press(screen.getByText("筒")); // スートタブ切替
  for (const label of ["1筒", "2筒", "3筒", "4筒"]) {
    fireEvent.press(screen.getByLabelText(label));
  }
}

/** 手牌13枚（1-9萬 + 1-4筒）をピッカーで入力する（開いたまま連続入力→閉じる）。 */
function inputFullHand() {
  inputFullHandKeepOpen();
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

  it("手牌が13枚に達するとピッカーがツモ牌入力へ自動で切り替わる（切替忘れ防止）", async () => {
    render(<ProblemEditScreen />);
    fireEvent.press(screen.getByLabelText("手牌に追加"));
    for (const label of ["1萬", "2萬", "3萬", "4萬", "5萬", "6萬", "7萬", "8萬", "9萬"]) {
      fireEvent.press(screen.getByLabelText(label));
    }
    fireEvent.press(screen.getByText("筒"));
    for (const label of ["1筒", "2筒", "3筒", "4筒"]) {
      fireEvent.press(screen.getByLabelText(label));
    }
    // 13枚目を置いた時点で入力先はツモ牌。そのまま置くとツモ牌になり、チップで外せる。
    fireEvent.press(screen.getByLabelText("5筒"));
    expect(screen.getByLabelText("ツモ牌 5筒 を外す")).toBeTruthy();
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

  describe("袋小路（無反応・解決不能なエラー）を作らない", () => {
    it("自分の席を対象席と同じにしたら、鳴き判断の対象席は自動で別の席に補正される", () => {
      render(<ProblemEditScreen />);
      fireEvent.press(screen.getByText("鳴き判断"));
      // 既定: 自分=東・対象=南。「誰の捨て牌」では南家が選択中。
      expect(screen.getByRole("button", { name: "南家", selected: true })).toBeTruthy();
      // 自分の席を南へ（「南」は自分の席と親の2セグメントにあり、先頭が自分の席）。
      fireEvent.press(screen.getAllByText("南")[0]!);
      // 対象席は選べる有効な別の席（東）へ補正される（同席のまま残さない）。
      expect(screen.getByRole("button", { name: "東家", selected: true })).toBeTruthy();
      // 「南家」は選択肢から消える（盤面プレビューの席名テキストはボタンではないので対象外）。
      expect(screen.queryByRole("button", { name: "南家" })).toBeNull();
    });

    it("出題形式を鳴き判断へ切り替えたら、ツモ牌入力のピッカーが開いたまま残らない", () => {
      render(<ProblemEditScreen />);
      inputFullHandKeepOpen(); // 13枚目で入力先は自動でツモ牌へ（ピッカーは開いたまま）
      expect(screen.getByText("ツモ牌を選ぶ")).toBeTruthy();
      fireEvent.press(screen.getByText("鳴き判断"));
      // 鳴き判断にツモ牌は無い。見えない入力先に置かせない（ピッカーを閉じる）。
      expect(screen.queryByText("ツモ牌を選ぶ")).toBeNull();
    });

    it("手牌チップを外したら、ツモ牌入力のままのピッカーは閉じる（ツモ牌の誤上書き防止）", () => {
      render(<ProblemEditScreen />);
      inputFullHandKeepOpen(); // 入力先は自動でツモ牌へ
      expect(screen.getByText("ツモ牌を選ぶ")).toBeTruthy();
      fireEvent.press(screen.getByLabelText("1萬 を外す"));
      // 外した直後に牌を置いてもツモ牌へ入らない（ピッカーごと閉じる）。
      expect(screen.queryByText("ツモ牌を選ぶ")).toBeNull();
    });

    it("鳴き判断で手牌13枚のままさらに置くと、黙殺せず「手牌は13枚まで」と知らせる", async () => {
      render(<ProblemEditScreen />);
      fireEvent.press(screen.getByText("鳴き判断")); // 鳴き判断はツモ牌への自動切替が無い
      inputFullHandKeepOpen();
      fireEvent.press(screen.getByLabelText("5筒")); // 14枚目
      expect(
        await screen.findByText("手牌は13枚までです（置いた牌はタップで外せます）。"),
      ).toBeTruthy();
    });

    it("ドラ6枚目を置こうとすると、黙殺せず「ドラ表示は5枚まで」と知らせる", async () => {
      render(<ProblemEditScreen />);
      fireEvent.press(screen.getByLabelText("ドラを追加"));
      for (const label of ["1萬", "2萬", "3萬", "4萬", "5萬"]) {
        fireEvent.press(screen.getByLabelText(label));
      }
      fireEvent.press(screen.getByLabelText("6萬")); // 6枚目は入らない
      expect(
        await screen.findByText("ドラ表示は5枚までです（置いた牌はタップで外せます）。"),
      ).toBeTruthy();
      expect(screen.queryByLabelText("ドラ6（6萬）を外す")).toBeNull();
    });
  });

  it("河の牌はタップでツモ切り⇄手出しを切替でき、保存 problem の river に乗る", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);
    inputFullHand();
    inputDrawn5p();

    // 東家の河に 9筒 を置く（既定は手出し。手牌・プレビューに無い牌でラベル衝突を避ける）。
    fireEvent.press(screen.getByLabelText("東家の河に追加"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("9筒"));
    fireEvent.press(screen.getByText("閉じる"));

    // チップタップでツモ切りへ（もう一度で手出しに戻せる）。
    fireEvent.press(screen.getByLabelText("東家の河1（9筒）をツモ切りにする"));
    expect(screen.getByLabelText("東家の河1（9筒）を手出しにする")).toBeTruthy();

    fireEvent.press(screen.getByText("下書き保存"));
    await waitFor(() => expect(mockCreateProblem).toHaveBeenCalledTimes(1));
    const [, input] = mockCreateProblem.mock.calls[0] as [string, { problem: Problem }];
    expect(input.problem.seats.east.river.map((d) => d.tsumogiri)).toEqual([true]);
  });

  it("河の✕で牌を削除できる（タップは切替に変わったため）", () => {
    render(<ProblemEditScreen />);
    fireEvent.press(screen.getByLabelText("東家の河に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByLabelText("東家の河1（1萬）を外す"));
    expect(screen.queryByLabelText("東家の河1（1萬）をツモ切りにする")).toBeNull();
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
