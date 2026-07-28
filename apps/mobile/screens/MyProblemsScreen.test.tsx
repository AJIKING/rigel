import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { makePost } from "./problem-test-helpers";
import { MyProblemsScreen } from "./MyProblemsScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
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
    mockGetMyProblems.mockResolvedValue(twoPosts());
    render(<MyProblemsScreen />);

    expect(await screen.findByText("下書きの問題")).toBeTruthy();
    expect(screen.getByText("下書き")).toBeTruthy();
    expect(screen.getByText("公開")).toBeTruthy();
    expect(screen.getByText("2 / 20問")).toBeTruthy();
  });

  it("「公開する」を押すと updateProblem が status:published で呼ばれ、表示が楽観更新される", async () => {
    mockGetMyProblems.mockResolvedValue(twoPosts());
    mockUpdateProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<MyProblemsScreen />);

    fireEvent.press(await screen.findByText("公開する"));
    expect(mockUpdateProblem).toHaveBeenCalledWith("t", "p1", { status: "published" });
    // 楽観更新: ボタンが「下書きに戻す」に変わる（2件とも公開中）。
    expect(screen.getAllByText("下書きに戻す")).toHaveLength(2);
    expect(screen.queryByText("下書き")).toBeNull();
  });

  it("削除は確認ダイアログを経てから deleteProblem を呼び、一覧から消える", async () => {
    mockGetMyProblems.mockResolvedValue(twoPosts());
    mockDeleteProblem.mockResolvedValue({ ok: true, status: 200 });
    render(<MyProblemsScreen />);

    fireEvent.press((await screen.findAllByText("削除"))[0]!);
    expect(mockConfirm).toHaveBeenCalled();
    expect(mockDeleteProblem).toHaveBeenCalledWith("t", "p1");
    // ---- CI 調査用（この branch 限り）: 5秒に延長し、失敗時は状態をダンプする ----
    try {
      await waitFor(() => expect(screen.queryByText("下書きの問題")).toBeNull(), {
        timeout: 5000,
      });
    } catch (e) {
      console.error("DEBUG deleteProblem calls:", JSON.stringify(mockDeleteProblem.mock.calls));
      console.error(
        "DEBUG deleteProblem results:",
        JSON.stringify(
          mockDeleteProblem.mock.results.map((r) => ({
            type: r.type,
            isP: r.value instanceof Promise,
          })),
        ),
      );
      console.error("DEBUG confirm calls:", mockConfirm.mock.calls.length);
      console.error("DEBUG tree:", JSON.stringify(screen.toJSON()).slice(0, 4000));
      throw e;
    }
  });

  it("「＋ 新規」で作成画面へ、「編集」でその問題の編集画面へ遷移する", async () => {
    mockGetMyProblems.mockResolvedValue(twoPosts());
    render(<MyProblemsScreen />);

    fireEvent.press(await screen.findByText("＋ 新規"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemEdit");

    fireEvent.press(screen.getAllByText("編集")[1]!);
    expect(mockNavigate).toHaveBeenCalledWith("ProblemEdit", { problemId: "p2" });
  });

  it("上限（20問）に達すると警告文言（LIMIT_MESSAGES.problems）を出す", async () => {
    mockGetMyProblems.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => makePost({ id: `p${i}`, title: `問題${i}` })),
    );
    render(<MyProblemsScreen />);

    expect(await screen.findByText("20 / 20問")).toBeTruthy();
    expect(screen.getByText(/無料プランの何切る問題は20問まで/)).toBeTruthy();
  });

  it("未ログイン時はログイン案内を出す（取得は呼ばない）", () => {
    mockAuth = { token: null, user: null };
    render(<MyProblemsScreen />);

    expect(screen.getByText(/ログインすると/)).toBeTruthy();
    expect(mockGetMyProblems).not.toHaveBeenCalled();
  });
});
