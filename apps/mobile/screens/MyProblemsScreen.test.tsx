import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { makePost } from "./problem-test-helpers";
import { MyProblemsScreen } from "./MyProblemsScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // フォーカス時の再取得はマウント時の実行で代替する（初回読み込みがこれに乗るため no-op にしない）。
  useFocusEffect: (cb: () => void | (() => void)) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock ファクトリ内
    require("react").useEffect(cb, [cb]);
  },
}));

let mockAuth: { token: string | null; user: { plan: string } | null };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockGetMyProblems = jest.fn();
const mockUpdateProblem = jest.fn();
const mockDeleteProblem = jest.fn();
jest.mock("../lib/api", () => ({
  getMyProblems: (...args: unknown[]) => mockGetMyProblems(...args),
  updateProblem: (...args: unknown[]) => mockUpdateProblem(...args),
  deleteProblem: (...args: unknown[]) => mockDeleteProblem(...args),
  listProblemDrafts: jest.fn(() => Promise.resolve([])),
  deleteProblemDraft: jest.fn(),
}));

// 削除確認はテストでは即 onConfirm（Alert はネイティブのためモック）。
const mockConfirm = jest.fn(({ onConfirm }: { onConfirm: () => void }) => onConfirm());
jest.mock("../lib/confirm", () => ({
  confirmDestructive: (params: { onConfirm: () => void }) => mockConfirm(params),
}));

const twoPosts = () => [
  makePost({ id: "p1", title: "下書きの問題", status: "draft" }),
  makePost({ id: "p2", title: "公開中の問題", status: "published" }),
];

describe("MyProblemsScreen（マイ何切る）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
  });

  it("draft/published のバッジと free のクォータ（2 / 20問）が表示される", async () => {
    mockGetMyProblems.mockResolvedValue({ items: twoPosts(), nextCursor: null });
    render(<MyProblemsScreen />);

    expect(await screen.findByText("下書きの問題")).toBeTruthy();
    expect(screen.getByText("下書き")).toBeTruthy();
    expect(screen.getByText("公開")).toBeTruthy();
    expect(screen.getByText("2 / 20問")).toBeTruthy();
  });

  it("カードのタップで編集画面へ。公開切替・編集・削除ボタンは一覧に出さない（編集画面に集約。[決定] 2026-08-08）", async () => {
    mockGetMyProblems.mockResolvedValue({ items: twoPosts(), nextCursor: null });
    render(<MyProblemsScreen />);

    fireEvent.press(await screen.findByText("下書きの問題"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemEdit", { problemId: "p1" });
    expect(screen.queryByText("公開する")).toBeNull();
    expect(screen.queryByText("編集")).toBeNull();
    expect(screen.queryByText("削除")).toBeNull();
  });

  it("「＋ 新規」で作成画面へ遷移する", async () => {
    mockGetMyProblems.mockResolvedValue({ items: twoPosts(), nextCursor: null });
    render(<MyProblemsScreen />);

    fireEvent.press(await screen.findByText("＋ 新規"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemEdit");
  });

  it("上限（20問）に達すると警告文言（LIMIT_MESSAGES.problems）を出す", async () => {
    mockGetMyProblems.mockResolvedValue({
      items: Array.from({ length: 20 }, (_, i) => makePost({ id: `p${i}`, title: `問題${i}` })),
      nextCursor: null,
    });
    render(<MyProblemsScreen />);

    expect(await screen.findByText("20 / 20問")).toBeTruthy();
    expect(screen.getByText(/無料プランの何切る問題は20問まで/)).toBeTruthy();
  });

  it("検索欄でタイトル部分一致に絞れる（web マイページと同一条件。Phase D）", async () => {
    mockGetMyProblems.mockResolvedValue({ items: twoPosts(), nextCursor: null });
    render(<MyProblemsScreen />);
    await screen.findByText("下書きの問題");

    fireEvent.changeText(screen.getByLabelText("問題を検索"), "公開中");
    expect(screen.getByText("公開中の問題")).toBeTruthy();
    expect(screen.queryByText("下書きの問題")).toBeNull();
  });

  it("状態フィルタで 公開/下書き に絞れる（web と同一の選択肢）", async () => {
    mockGetMyProblems.mockResolvedValue({ items: twoPosts(), nextCursor: null });
    render(<MyProblemsScreen />);
    await screen.findByText("下書きの問題");

    // シートの選択肢はカードのバッジ（公開/下書き）と同じ文言なので、シート内で探す。
    fireEvent.press(screen.getByLabelText("状態で絞り込み"));
    fireEvent.press(within(screen.getByTestId("bottom-sheet-card")).getByText("公開"));
    expect(screen.getByText("公開中の問題")).toBeTruthy();
    expect(screen.queryByText("下書きの問題")).toBeNull();

    fireEvent.press(screen.getByLabelText("状態で絞り込み"));
    fireEvent.press(within(screen.getByTestId("bottom-sheet-card")).getByText("下書き"));
    expect(screen.getByText("下書きの問題")).toBeTruthy();
    expect(screen.queryByText("公開中の問題")).toBeNull();
  });

  it("未ログイン時はログイン案内を出す（取得は呼ばない）", () => {
    mockAuth = { token: null, user: null };
    render(<MyProblemsScreen />);

    expect(screen.getByText(/サインインすると/)).toBeTruthy();
    expect(mockGetMyProblems).not.toHaveBeenCalled();
  });
});
