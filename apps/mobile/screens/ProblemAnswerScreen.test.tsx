import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Share, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { makeCallProblem, makePost } from "./problem-test-helpers";
import { ProblemAnswerScreen } from "./ProblemAnswerScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { problemId: "p1" } }),
}));

let mockAuth: { token: string | null; user: { plan: string } | null };
jest.mock("../lib/auth", () => ({
  useAuth: () => mockAuth,
}));

const mockGetProblem = jest.fn();
const mockAnswerProblem = jest.fn();
const mockGetProblemStats = jest.fn();
jest.mock("../lib/api", () => ({
  getProblem: (...args: unknown[]) => mockGetProblem(...args),
  answerProblem: (...args: unknown[]) => mockAnswerProblem(...args),
  getProblemStats: (...args: unknown[]) => mockGetProblemStats(...args),
}));

describe("ProblemAnswerScreen（何切る回答画面）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth = { token: "t", user: { plan: "free" } };
  });

  it("回答前は出題者の答え・解説を表示しない", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("テスト問題")).toBeTruthy();
    expect(screen.queryByText("出題者の答え")).toBeNull();
    expect(screen.queryByText("テスト解説")).toBeNull();
  });

  it("牌タップ+リーチ→回答すると answerProblem が呼ばれ、答え・解説・分布が出る", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    mockAnswerProblem.mockResolvedValue({ ok: true, status: 200 });
    mockGetProblemStats.mockResolvedValue({
      counts: { "discard:5p:riichi": 2, "discard:1m": 1 },
      total: 3,
      myChoiceKey: "discard:5p:riichi",
      myAction: { type: "discard", tile: "5p", riichi: true },
    });
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByLabelText("5筒")); // ツモ牌 5p を選ぶ
    fireEvent.press(screen.getByText("リーチ"));
    fireEvent.press(screen.getByText("回答する"));

    expect(await screen.findByText("出題者の答え")).toBeTruthy();
    expect(mockAnswerProblem).toHaveBeenCalledWith("t", "p1", {
      type: "discard",
      tile: "5p",
      riichi: true,
    });
    expect(screen.getByText("あなたの回答: 5筒切り・リーチ")).toBeTruthy();
    expect(screen.getByText("5筒切り")).toBeTruthy(); // 出題者の答え（riichi なし）
    expect(screen.getByText("テスト解説")).toBeTruthy();
    // 分布（choiceKeyLabel + % + 自分の回答に印）。
    expect(await screen.findByText("回答分布（3人）")).toBeTruthy();
    expect(screen.getByText("5筒切り・リーチ（あなた）")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("1萬切り")).toBeTruthy();
  });

  it("未ログインは answerProblem を呼ばず、ログイン導線を出す", async () => {
    mockAuth = { token: null, user: null };
    mockGetProblem.mockResolvedValue(makePost());
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByLabelText("5筒"));
    fireEvent.press(screen.getByText("回答する"));

    expect(await screen.findByText("出題者の答え")).toBeTruthy();
    expect(mockAnswerProblem).not.toHaveBeenCalled();
    expect(screen.getByText(/ログインすると回答分布が見られます/)).toBeTruthy();
  });

  it("鳴き判断はスルー・ポン・チー・カンの選択式（スルーで回答できる）", async () => {
    mockGetProblem.mockResolvedValue(makePost({ problem: makeCallProblem() }));
    mockAnswerProblem.mockResolvedValue({ ok: true, status: 200 });
    mockGetProblemStats.mockResolvedValue({
      counts: { pass: 1 },
      total: 1,
      myChoiceKey: "pass",
      myAction: { type: "pass" },
    });
    render(<ProblemAnswerScreen />);

    // 対象牌の問いかけと選択肢。
    expect(await screen.findByText(/南家が切った 發 を鳴きますか/)).toBeTruthy();
    expect(screen.getByText("ポン")).toBeTruthy();
    expect(screen.getByText("チー")).toBeTruthy();
    expect(screen.getByText("カン")).toBeTruthy();

    fireEvent.press(screen.getByText("スルー"));
    fireEvent.press(screen.getByText("回答する"));

    expect(await screen.findByText("あなたの回答: スルー")).toBeTruthy();
    expect(mockAnswerProblem).toHaveBeenCalledWith("t", "p1", { type: "pass" });
  });

  it("盤面は回転卓（BoardTable）で表示し、鳴き判断の対象牌に強調枠が付く", async () => {
    mockGetProblem.mockResolvedValue(makePost({ problem: makeCallProblem() }));
    render(<ProblemAnswerScreen />);

    // 対象牌（南家の河の末尾＝發）は卓上でアクセント色の枠で強調される。
    const target = await screen.findByLabelText("發");
    expect(StyleSheet.flatten(target.props.style)).toMatchObject({
      borderColor: colors.accent,
    });
    // 卓中央には場風+巡目（KifuPlayer と同じ回転卓の中央表示）。
    expect(screen.getByText("東場 6巡目")).toBeTruthy();
  });

  it("公開問題では OS 共有を開ける（下書きには出さない）", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    mockGetProblem.mockResolvedValue(makePost({ id: "p1", status: "published" }));
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByLabelText("共有"));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://rigel.plaria.co.jp/p/p1" }),
      ),
    );
    share.mockRestore();
  });

  it("下書き問題には共有ボタンを出さない", async () => {
    mockGetProblem.mockResolvedValue(makePost({ status: "draft" }));
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("テスト問題")).toBeTruthy();
    expect(screen.queryByLabelText("共有")).toBeNull();
  });

  it("見つからない問題（draft の他人アクセス等）は「見つかりません」を出す", async () => {
    mockGetProblem.mockResolvedValue(null);
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("問題が見つかりません。")).toBeTruthy();
  });
});
