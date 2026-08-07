import { KifuSchema, ProblemSchema, type Problem } from "@rigel/schema";
import { PROBLEM_DORA_REQUIRED_MESSAGE } from "@rigel/ui";
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

let mockAuth: {
  token: string | null;
  user: { plan: string; remainingCalls?: number; monthlyCallQuota?: number } | null;
};
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockGetProblem = jest.fn();
const mockCreateProblem = jest.fn();
const mockUpdateProblem = jest.fn();
const mockDeleteProblem = jest.fn();
const mockAnalyzeProblem = jest.fn();
const mockGetProblemAnalysisJob = jest.fn();
jest.mock("../lib/api", () => ({
  getProblem: (...args: unknown[]) => mockGetProblem(...args),
  createProblem: (...args: unknown[]) => mockCreateProblem(...args),
  updateProblem: (...args: unknown[]) => mockUpdateProblem(...args),
  deleteProblem: (...args: unknown[]) => mockDeleteProblem(...args),
  analyzeProblem: (...args: unknown[]) => mockAnalyzeProblem(...args),
  getProblemAnalysisJob: (...args: unknown[]) => mockGetProblemAnalysisJob(...args),
}));

// 削除確認はテストでは即 onConfirm（Alert はネイティブのためモック）。文言検証用に引数を残す。
const mockConfirm = jest.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm());
jest.mock("../lib/confirm", () => ({
  confirmDestructive: (params: { onConfirm: () => void }) => mockConfirm(params),
}));

const mockPickImage = jest.fn();
jest.mock("../lib/pick-image", () => ({
  pickImage: (...args: unknown[]) => mockPickImage(...args),
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

/** ドラ表示牌を1枚（1索）入れる（保存ゲートのドラ必須 2026-08-08 を満たす）。 */
function inputDora1s() {
  fireEvent.press(screen.getByLabelText("ドラ表示牌を追加"));
  fireEvent.press(screen.getByText("索"));
  fireEvent.press(screen.getByLabelText("1索"));
  fireEvent.press(screen.getByText("閉じる"));
}

describe("ProblemEditScreen（何切る問題の作成/編集）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
    mockParams = undefined;
  });

  it("写真から作成: 解析結果（AIドラフト）がエディタへ流し込まれ、読み取りメモが出る", async () => {
    mockAuth = { token: "t", user: { plan: "pro", remainingCalls: 300, monthlyCallQuota: 320 } };
    mockPickImage.mockResolvedValue({
      status: "picked",
      file: { uri: "file://h.jpg", name: "h.jpg", type: "image/jpeg" },
    });
    // 非同期ジョブ（202 + ポーリング。async-analysis.md Task 8）: done で結果ドラフト同梱。
    mockAnalyzeProblem.mockResolvedValue({ ok: true, jobId: "job-1" });
    mockGetProblemAnalysisJob.mockResolvedValue({
      id: "job-1",
      status: "done",
      reason: null,
      draft: KifuSchema.parse({
        schemaVersion: "1.0.0",
        capturedAt: "2026-07-14T00:00:00.000Z",
        cameraBottomSeat: "east",
        seats: {
          east: {
            hand: [
              { tile: "1m" },
              { tile: null }, // 読めない牌は落ちる（readingNotes で告げる）
            ],
          },
          south: { river: [{ order: 1, tile: "9s" }] },
          west: {},
          north: {},
        },
        readingNotes: "グレアで1枚読めず",
      }),
    });
    render(<ProblemEditScreen />);

    // 残枠は撮る前に見せる（送信後の枠切れで手間を無駄にしない。Capture と同方針）。
    expect(screen.getByText("解析枠 残り 300 / 320（今月）")).toBeTruthy();
    fireEvent.press(screen.getByText(/手牌の写真/));
    await waitFor(() => expect(mockPickImage).toHaveBeenCalled());
    fireEvent.press(screen.getByText("AI再現"));

    // 読み取りメモと「全牌目検してから保存」の促しが出て、手牌・河が流し込まれる。
    expect(await screen.findByText(/グレアで1枚読めず/)).toBeTruthy();
    expect(screen.getByText(/目で確認してから保存/)).toBeTruthy();
    expect(mockAnalyzeProblem).toHaveBeenCalled();
    // 手牌チップ・南家の河チップ（盤面プレビューにも同じ牌が出るため複数一致を許容）。
    expect(screen.getAllByLabelText("1萬").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("9索").length).toBeGreaterThan(0);
  });

  it("free プランには「写真から作成」を出さない（解析枠0＝kifu と同方針）", () => {
    render(<ProblemEditScreen />); // mockAuth 既定 = free
    expect(screen.queryByText(/写真から作成/)).toBeNull();
  });

  it("13枚+ツモ+コメントを入れて公開保存すると、答えを持たない problem が createProblem に渡る", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);

    // 正解は設けない（答え入力の UI 自体が無い）。
    expect(screen.queryByText("出題者の答え")).toBeNull();

    fireEvent.changeText(screen.getByLabelText("タイトル"), "テスト作成");
    inputFullHand();
    inputDrawn5p();
    inputDora1s();
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

  it("ルール設定シートで変えたルールが保存 problem の rules に乗る（web と対。Phase D）", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);

    fireEvent.press(screen.getByText("ルール設定"));
    // 既定は Mリーグ相当（赤5=各1）。「なし」へ変更して保存する。
    fireEvent.press(screen.getByText("なし"));
    fireEvent.press(screen.getByLabelText("ルールを保存"));

    fireEvent.changeText(screen.getByLabelText("タイトル"), "ルールつき");
    inputFullHand();
    inputDrawn5p();
    inputDora1s();
    fireEvent.press(screen.getByText("公開して保存"));

    await waitFor(() => expect(mockCreateProblem).toHaveBeenCalledTimes(1));
    const [, input] = mockCreateProblem.mock.calls[0] as [string, { problem: Problem }];
    expect(input.problem.rules.aka).toBe("none");
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

  it("ドラ表示牌が未選択だと保存せずエラー文言を出す（2026-08-08 オーナー）", async () => {
    render(<ProblemEditScreen />);
    inputFullHand();
    inputDrawn5p();
    fireEvent.press(screen.getByText("下書き保存"));

    expect(await screen.findByText(PROBLEM_DORA_REQUIRED_MESSAGE)).toBeTruthy();
    expect(mockCreateProblem).not.toHaveBeenCalled();
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
    inputDora1s();
    fireEvent.press(screen.getByText("公開して保存"));

    expect(await screen.findByText(/無料プランの何切る問題は20問まで/)).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("プレビューのネームプレートは絶対席＋（親）で出る（親を変えても自分の席とずれない）", () => {
    render(<ProblemEditScreen />);
    // 親を南へ（「南」は自分の席セグ→親セグの順に並ぶ）。自分の席は既定=東のまま。
    fireEvent.press(screen.getAllByText("南")[1]!);
    // 編集プレビューは絶対席で出し、親には（親）マークを付ける。
    // 風表記（親基準）なら「南家」（=西の風）が出るはずで、絶対席なら出ない。
    expect(screen.getByText("東家")).toBeTruthy();
    expect(screen.getByText("南家（親）")).toBeTruthy();
    expect(screen.queryByText("南家")).toBeNull();
  });

  it("盤面プレビューは既定で表示され、折りたたみできる", () => {
    render(<ProblemEditScreen />);
    // 既定 open：卓中央に場風+巡目（既定=東場・1巡目。2026-08-08 オーナー。旧6巡目）が出る。
    expect(screen.getByText("東場 1巡目")).toBeTruthy();
    fireEvent.press(screen.getByText(/プレビュー/));
    expect(screen.queryByText("東場 1巡目")).toBeNull();
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
      fireEvent.press(screen.getByLabelText("ドラ表示牌を追加"));
      for (const label of ["1萬", "2萬", "3萬", "4萬", "5萬"]) {
        fireEvent.press(screen.getByLabelText(label));
      }
      fireEvent.press(screen.getByLabelText("6萬")); // 6枚目は入らない
      expect(
        await screen.findByText("ドラ表示牌は5枚までです（置いた牌はタップで外せます）。"),
      ).toBeTruthy();
      expect(screen.queryByLabelText("ドラ表示牌6（6萬）を外す")).toBeNull();
    });
  });

  it("河の牌はタップ→ピッカーでツモ切りを切替でき、保存 problem の river に乗る", async () => {
    mockCreateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);
    inputFullHand();
    inputDrawn5p();
    inputDora1s();

    // 東家の河に 9筒 を置く（既定は手出し。手牌・プレビューに無い牌でラベル衝突を避ける）。
    fireEvent.press(screen.getByLabelText("東家の河に追加"));
    fireEvent.press(screen.getByText("筒"));
    fireEvent.press(screen.getByLabelText("9筒"));
    fireEvent.press(screen.getByText("閉じる"));

    // チップタップで編集ピッカーが開き、「ツモ切り」チップで切替できる。
    fireEvent.press(screen.getByLabelText("東家の河1（9筒）を変更"));
    fireEvent.press(screen.getByText("ツモ切り"));
    fireEvent.press(screen.getByText("閉じる"));

    fireEvent.press(screen.getByText("下書き保存"));
    await waitFor(() => expect(mockCreateProblem).toHaveBeenCalledTimes(1));
    const [, input] = mockCreateProblem.mock.calls[0] as [string, { problem: Problem }];
    expect(input.problem.seats.east.river.map((d) => d.tsumogiri)).toEqual([true]);
  });

  it("河の牌はタップ→ピッカーで別の牌に変更できる", () => {
    render(<ProblemEditScreen />);
    fireEvent.press(screen.getByLabelText("東家の河に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    // タップで編集ピッカーを開き、9萬 を選ぶと置き換わる。
    fireEvent.press(screen.getByLabelText("東家の河1（1萬）を変更"));
    fireEvent.press(screen.getByLabelText("9萬"));
    expect(screen.getByLabelText("東家の河1（9萬）を変更")).toBeTruthy();
    expect(screen.queryByLabelText("東家の河1（1萬）を変更")).toBeNull();
  });

  it("河の牌はタップ→ピッカーの「削除」で外せる（チップの✕は廃止）", () => {
    render(<ProblemEditScreen />);
    fireEvent.press(screen.getByLabelText("東家の河に追加"));
    fireEvent.press(screen.getByLabelText("1萬"));
    fireEvent.press(screen.getByText("閉じる"));

    // ✕ボタンはもう無い。
    expect(screen.queryByLabelText("東家の河1（1萬）を外す")).toBeNull();
    fireEvent.press(screen.getByLabelText("東家の河1（1萬）を変更"));
    fireEvent.press(screen.getByText("削除"));
    expect(screen.queryByLabelText("東家の河1（1萬）を変更")).toBeNull();
  });

  it("写真から作成（AI再現）は新規では開いて出るが、既存問題の編集では折りたたみ既定", async () => {
    mockAuth = { token: "t", user: { plan: "pro", remainingCalls: 300, monthlyCallQuota: 320 } };
    // 新規: ボタンまで見える。
    const first = render(<ProblemEditScreen />);
    expect(screen.getByText(/手牌の写真を選ぶ/)).toBeTruthy();
    first.unmount();

    // 編集: 見出しはあるが中身は畳まれている。見出しタップで開ける。
    mockParams = { problemId: "p1" };
    mockGetProblem.mockResolvedValue(makePost({ id: "p1", title: "既存の問題" }));
    render(<ProblemEditScreen />);
    await screen.findByDisplayValue("既存の問題");
    expect(screen.getByText(/写真から作成/)).toBeTruthy();
    expect(screen.queryByText(/手牌の写真を選ぶ/)).toBeNull();
    fireEvent.press(screen.getByText(/写真から作成/));
    expect(screen.getByText(/手牌の写真を選ぶ/)).toBeTruthy();
  });

  it("既存問題の管理行: 「回答画面を見る」で公開画面へ、「この問題を削除」は確認を経て削除し戻る", async () => {
    mockParams = { problemId: "p1" };
    mockGetProblem.mockResolvedValue(makePost({ id: "p1", title: "既存の問題" }));
    mockDeleteProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<ProblemEditScreen />);
    await screen.findByDisplayValue("既存の問題");

    fireEvent.press(screen.getByText("回答画面を見る"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemAnswer", { problemId: "p1" });

    fireEvent.press(screen.getByText("この問題を削除"));
    // 確認文言は web/mobile 共通の DELETE_CONFIRM（回答分布も消えることを告げる）。
    expect(mockConfirm.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining("回答の分布も削除され"),
    });
    expect(mockDeleteProblem).toHaveBeenCalledWith("t", "p1");
    await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
  });

  it("新規作成では管理行（回答画面リンク・削除）を出さない", () => {
    render(<ProblemEditScreen />); // mockParams = undefined（新規）
    expect(screen.queryByText("回答画面を見る")).toBeNull();
    expect(screen.queryByText("この問題を削除")).toBeNull();
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
