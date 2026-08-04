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

// お気に入り（サーバー保存）はフックごとスタブ（PublicListScreen テストと同型）。
// 状態はカード（viewerFaved / favoriteCount）が持つので、apply はそのまま返す。
const mockToggle = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  useFavorites: () => ({ apply: (cards: unknown[]) => cards, toggle: mockToggle, error: null }),
}));

/** API のページ形（カーソル方式）。既定は最終ページ（nextCursor=null）。 */
function page<T>(items: T[], nextCursor: string | null = null) {
  return { items, nextCursor };
}

describe("ProblemsListScreen（何切る公開一覧）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("牌譜一覧と同じ絞り込み（新着/人気/今週/お気に入り）ができる", async () => {
    const day = 24 * 3600 * 1000;
    mockGetPublicProblems.mockResolvedValue(
      page([
        makePost({
          id: "old",
          title: "古い問題",
          createdAt: new Date(Date.now() - 10 * day).toISOString(),
          viewerFaved: true,
        }),
        makePost({
          id: "new",
          title: "今週の問題",
          createdAt: new Date().toISOString(),
          favoriteCount: 1,
        }),
      ]),
    );
    render(<ProblemsListScreen />);
    expect(await screen.findByText("古い問題")).toBeTruthy();

    // 人気: お気に入りが多い順（両方出るが、件数の多い「今週の問題」が先）。
    fireEvent.press(screen.getByText("人気"));
    expect(screen.getByText("古い問題")).toBeTruthy();
    expect(screen.getByText("今週の問題")).toBeTruthy();

    // 今週: 直近7日の問題だけ。
    fireEvent.press(screen.getByText("今週"));
    expect(screen.queryByText("古い問題")).toBeNull();
    expect(screen.getByText("今週の問題")).toBeTruthy();

    // お気に入り: 自分がお気に入りした問題だけ。
    fireEvent.press(screen.getByText("お気に入り"));
    expect(screen.getByText("古い問題")).toBeTruthy();
    expect(screen.queryByText("今週の問題")).toBeNull();

    // 新着で全件へ戻る。
    fireEvent.press(screen.getByText("新着"));
    expect(screen.getByText("古い問題")).toBeTruthy();
    expect(screen.getByText("今週の問題")).toBeTruthy();
  });

  it("カードの星がお気に入り状態に配線される（押すと toggle が呼ばれる）", async () => {
    mockGetPublicProblems.mockResolvedValue(
      page([makePost({ id: "p1", title: "リーチ判断の基本" })]),
    );
    render(<ProblemsListScreen />);
    await screen.findByText("リーチ判断の基本");

    fireEvent.press(screen.getAllByLabelText("お気に入り")[0]!);
    expect(mockToggle).toHaveBeenCalledWith("problem", expect.objectContaining({ id: "p1" }));
  });

  it("お気に入りが空のときは絞り込み向けの空文言を出す", async () => {
    mockGetPublicProblems.mockResolvedValue(
      page([makePost({ id: "p1", title: "リーチ判断の基本" })]),
    );
    render(<ProblemsListScreen />);
    await screen.findByText("リーチ判断の基本");

    fireEvent.press(screen.getByText("お気に入り"));
    expect(screen.getByText("お気に入りした問題がまだありません。")).toBeTruthy();
  });

  it("公開問題がカード（タイトル・出題形式・日付）で新着順に表示される", async () => {
    mockGetPublicProblems.mockResolvedValue(
      page([
        makePost({ id: "p1", title: "リーチ判断の基本", createdAt: "2026-07-01T00:00:00.000Z" }),
        makePost({
          id: "p2",
          title: "この發は鳴く？",
          problem: makeCallProblem(),
          createdAt: "2026-07-02T00:00:00.000Z",
        }),
      ]),
    );
    render(<ProblemsListScreen />);

    expect(await screen.findByText("リーチ判断の基本")).toBeTruthy();
    expect(screen.getByText("この發は鳴く？")).toBeTruthy();
    // 出題形式ラベル（call=鳴き判断。discard=何切る は画面タイトルと重複するため件数で確認）。
    expect(screen.getByText("鳴き判断")).toBeTruthy();
    expect(screen.getAllByText("何切る").length).toBeGreaterThanOrEqual(2); // タイトル + カード
  });

  it("カードをタップすると回答画面（ProblemAnswer）へ遷移する", async () => {
    mockGetPublicProblems.mockResolvedValue(
      page([makePost({ id: "p1", title: "リーチ判断の基本" })]),
    );
    render(<ProblemsListScreen />);

    fireEvent.press(await screen.findByText("リーチ判断の基本"));
    expect(mockNavigate).toHaveBeenCalledWith("ProblemAnswer", { problemId: "p1" });
  });

  it("右上に「マイ何切る」リンクは出さない（マイページの何切るセグメントと重複するため廃止）", async () => {
    mockGetPublicProblems.mockResolvedValue(page([]));
    render(<ProblemsListScreen />);

    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
    expect(screen.queryByText("マイ何切る")).toBeNull();
  });

  it("問題が無いときは空状態の文言を出す", async () => {
    mockGetPublicProblems.mockResolvedValue(page([]));
    render(<ProblemsListScreen />);
    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
  });

  it("API 未接続（取得失敗）はエラーにせず空状態として表示する", async () => {
    mockGetPublicProblems.mockRejectedValue(new Error("network"));
    render(<ProblemsListScreen />);
    expect(await screen.findByText("まだ公開された問題がありません。")).toBeTruthy();
  });

  it("末尾到達（onEndReached）で次ページをカーソル付きで取得して追記する", async () => {
    mockGetPublicProblems
      .mockResolvedValueOnce(page([makePost({ id: "p1", title: "1ページ目" })], "1000_p1"))
      .mockResolvedValueOnce(page([makePost({ id: "p2", title: "2ページ目" })], null));
    render(<ProblemsListScreen />);
    await screen.findByText("1ページ目");

    fireEvent(screen.getByTestId("problems-list"), "onEndReached");
    expect(await screen.findByText("2ページ目")).toBeTruthy();
    expect(mockGetPublicProblems).toHaveBeenLastCalledWith("1000_p1");
    expect(screen.getByText("1ページ目")).toBeTruthy(); // 既存の表示は保つ

    // 最終ページ到達後はもう取得しない。
    fireEvent(screen.getByTestId("problems-list"), "onEndReached");
    expect(mockGetPublicProblems).toHaveBeenCalledTimes(2);
  });
});
