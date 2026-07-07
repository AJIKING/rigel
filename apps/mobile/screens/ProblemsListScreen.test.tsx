import { fireEvent, render, screen } from "@testing-library/react-native";
import { makeCallProblem, makePost } from "./problem-test-helpers";
import { ProblemsListScreen } from "./ProblemsListScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockGetPublicProblems = jest.fn();
jest.mock("../lib/api", () => ({
  getPublicProblems: (...args: unknown[]) => mockGetPublicProblems(...args),
}));

describe("ProblemsListScreen（何切る公開一覧）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("公開問題がカード（タイトル・出題形式・日付）で新着順に表示される", async () => {
    mockGetPublicProblems.mockResolvedValue([
      makePost({ id: "p1", title: "リーチ判断の基本", createdAt: "2026-07-01T00:00:00.000Z" }),
      makePost({
        id: "p2",
        title: "この發は鳴く？",
        problem: makeCallProblem(),
        createdAt: "2026-07-02T00:00:00.000Z",
      }),
    ]);
    render(<ProblemsListScreen />);

    expect(await screen.findByText("リーチ判断の基本")).toBeTruthy();
    expect(screen.getByText("この發は鳴く？")).toBeTruthy();
    // 出題形式ラベル（call=鳴き判断。discard=何切る は画面タイトルと重複するため件数で確認）。
    expect(screen.getByText("鳴き判断")).toBeTruthy();
    expect(screen.getAllByText("何切る").length).toBeGreaterThanOrEqual(2); // タイトル + カード
  });

  it("カードをタップすると回答画面（ProblemAnswer）へ遷移する", async () => {
    mockGetPublicProblems.mockResolvedValue([makePost({ id: "p1", title: "リーチ判断の基本" })]);
    render(<ProblemsListScreen />);

    fireEvent.press(await screen.findByText("リーチ判断の基本"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemAnswer", { problemId: "p1" });
  });

  it("右上の「マイ何切る」で onOpenMine（マイページの何切るを開く導線）が呼ばれる", async () => {
    mockGetPublicProblems.mockResolvedValue([]);
    const onOpenMine = jest.fn();
    render(<ProblemsListScreen onOpenMine={onOpenMine} />);

    fireEvent.press(await screen.findByText("マイ何切る"));
    expect(onOpenMine).toHaveBeenCalled();
  });

  it("onOpenMine が無い（配線されない）ときは「マイ何切る」リンクを出さない", async () => {
    mockGetPublicProblems.mockResolvedValue([]);
    render(<ProblemsListScreen />);

    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
    expect(screen.queryByText("マイ何切る")).toBeNull();
  });

  it("問題が無いときは空状態の文言を出す", async () => {
    mockGetPublicProblems.mockResolvedValue([]);
    render(<ProblemsListScreen />);
    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
  });

  it("API 未接続（取得失敗）はエラーにせず空状態として表示する", async () => {
    mockGetPublicProblems.mockRejectedValue(new Error("network"));
    render(<ProblemsListScreen />);
    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
  });
});
