import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Share, StyleSheet } from "react-native";
import { colors } from "../lib/theme";
import { makeCallProblem, makeOpponentHandsProblem, makePost } from "./problem-test-helpers";
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

  it.each([
    {
      name: "何切る（discard）",
      post: makePost(),
      question: "あなたなら何を切る？",
    },
    {
      name: "鳴き判断（call）",
      post: makePost({ problem: makeCallProblem() }),
      question: "南家が切った 發、あなたならどうする？",
    },
  ])("タイトル直下に質問見出しを出す（$name）", async ({ post, question }) => {
    mockGetProblem.mockResolvedValue(post);
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText(question)).toBeTruthy();
    // 旧文言（〜を鳴きますか？）は質問見出しに置き換える。
    expect(screen.queryByText(/を鳴きますか/)).toBeNull();
  });

  it("回答前は出題者のコメントを表示しない", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("テスト問題")).toBeTruthy();
    expect(screen.queryByText("出題者のコメント")).toBeNull();
    expect(screen.queryByText("テスト解説")).toBeNull();
  });

  it("牌タップ+リーチ→回答すると answerProblem が呼ばれ、出題者の答えは出さずコメント・分布が出る", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    mockAnswerProblem.mockResolvedValue({ ok: true, status: 200 });
    mockGetProblemStats.mockResolvedValue({
      counts: { "discard:5p:riichi": 2, "discard:1m": 1 },
      total: 3,
      myChoiceKey: "discard:5p:riichi",
      myAction: { type: "discard", tile: "5p", riichi: true },
    });
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "5筒" })); // ツモ牌 5p を選ぶ
    fireEvent.press(screen.getByText("リーチ"));
    fireEvent.press(screen.getByText("回答する"));

    expect(await screen.findByText("あなたの回答: 5筒切り・リーチ")).toBeTruthy();
    expect(mockAnswerProblem).toHaveBeenCalledWith("t", "p1", {
      type: "discard",
      tile: "5p",
      riichi: true,
    });
    // 正解は設けない（出題者の答えは表示しない）。コメントは見出し付きで出す。
    expect(screen.queryByText("出題者の答え")).toBeNull();
    expect(screen.getByText("出題者のコメント")).toBeTruthy();
    expect(screen.getByText("テスト解説")).toBeTruthy();
    // 分布（choiceKeyLabel + % + 自分の回答に印）。
    expect(await screen.findByText("回答分布（3人）")).toBeTruthy();
    expect(screen.getByText("5筒切り・リーチ（あなた）")).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
    expect(screen.getByText("1萬切り")).toBeTruthy();
  });

  it("牌を選ぶと回答ボタンの近くに「選択中:」の手を表示する（押し間違い防止）", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    render(<ProblemAnswerScreen />);

    // 選択前は出ない。
    expect(await screen.findByText("テスト問題")).toBeTruthy();
    expect(screen.queryByText(/選択中:/)).toBeNull();

    fireEvent.press(screen.getByRole("button", { name: "5筒" }));
    expect(screen.getByText("選択中: 5筒切り")).toBeTruthy();

    fireEvent.press(screen.getByText("リーチ"));
    expect(screen.getByText("選択中: 5筒切り・リーチ")).toBeTruthy();
  });

  it("回答分布で自分の回答のバーだけアクセント色で強調される", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    mockAnswerProblem.mockResolvedValue({ ok: true, status: 200 });
    mockGetProblemStats.mockResolvedValue({
      counts: { "discard:5p:riichi": 2, "discard:1m": 1 },
      total: 3,
      myChoiceKey: "discard:5p:riichi",
      myAction: { type: "discard", tile: "5p", riichi: true },
    });
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByText("リーチ"));
    fireEvent.press(screen.getByText("回答する"));
    expect(await screen.findByText("回答分布（3人）")).toBeTruthy();

    // 自分のバーはアクセント色（web の statBarMine と同じ意図）、他のバーは別色。
    const mine = StyleSheet.flatten(screen.getByTestId("stat-bar-discard:5p:riichi").props.style);
    const other = StyleSheet.flatten(screen.getByTestId("stat-bar-discard:1m").props.style);
    expect(mine.backgroundColor).toBe(colors.accent);
    expect(other.backgroundColor).not.toBe(colors.accent);
  });

  it("「回答をやり直す」で再選択でき、answerProblem は2回目の内容で上書き送信される", async () => {
    mockGetProblem.mockResolvedValue(makePost());
    mockAnswerProblem.mockResolvedValue({ ok: true, status: 200 });
    mockGetProblemStats.mockResolvedValue({
      counts: { "discard:5p": 1 },
      total: 1,
      myChoiceKey: "discard:5p",
      myAction: { type: "discard", tile: "5p", riichi: false },
    });
    render(<ProblemAnswerScreen />);

    // 1回目: 5p を切る。
    fireEvent.press(await screen.findByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByText("回答する"));
    expect(await screen.findByText("あなたの回答: 5筒切り")).toBeTruthy();

    // やり直し → 回答 UI に戻る（選択は保持されている）。
    fireEvent.press(screen.getByText("回答をやり直す"));
    expect(screen.queryByText(/あなたの回答:/)).toBeNull();
    expect(screen.getByText("選択中: 5筒切り")).toBeTruthy();

    // 2回目: 1m に選び直して再回答 → サーバ upsert 前提で2回目の内容が送られる。
    fireEvent.press(screen.getByRole("button", { name: "1萬" }));
    fireEvent.press(screen.getByText("回答する"));
    expect(await screen.findByText("あなたの回答: 1萬切り")).toBeTruthy();
    expect(mockAnswerProblem).toHaveBeenCalledTimes(2);
    expect(mockAnswerProblem).toHaveBeenLastCalledWith("t", "p1", {
      type: "discard",
      tile: "1m",
      riichi: false,
    });
  });

  it("未ログインは answerProblem を呼ばず、ログイン導線を出す", async () => {
    mockAuth = { token: null, user: null };
    mockGetProblem.mockResolvedValue(makePost());
    render(<ProblemAnswerScreen />);

    fireEvent.press(await screen.findByRole("button", { name: "5筒" }));
    fireEvent.press(screen.getByText("回答する"));

    expect(await screen.findByText("あなたの回答: 5筒切り")).toBeTruthy();
    expect(mockAnswerProblem).not.toHaveBeenCalled();
    expect(screen.getByText(/ログインすると回答分布が見られます/)).toBeTruthy();
  });

  it.each([
    { name: "未ログインでは出す", token: null, shown: true },
    { name: "ログイン時は出さない", token: "t", shown: false },
  ])(
    "回答前の集計ヒント「※ログインすると回答が集計されます。」（$name）",
    async ({ token, shown }) => {
      mockAuth = { token, user: token ? { plan: "free" } : null };
      mockGetProblem.mockResolvedValue(makePost());
      render(<ProblemAnswerScreen />);

      expect(await screen.findByText("テスト問題")).toBeTruthy();
      const hint = screen.queryByText("※ログインすると回答が集計されます。");
      if (shown) expect(hint).toBeTruthy();
      else expect(hint).toBeNull();
    },
  );

  it.each([
    { name: "ツモ牌あり（discard）は出す", post: makePost(), shown: true },
    {
      name: "ツモ牌なし（call）は出さない",
      post: makePost({ problem: makeCallProblem() }),
      shown: false,
    },
  ])("ツモ牌の注記「右端はツモ牌」（$name）", async ({ post, shown }) => {
    mockGetProblem.mockResolvedValue(post);
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("テスト問題")).toBeTruthy();
    const note = screen.queryByText("右端はツモ牌");
    if (shown) expect(note).toBeTruthy();
    else expect(note).toBeNull();
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

    // 対象牌の問いかけ（質問見出し）と選択肢。
    expect(await screen.findByText("南家が切った 發、あなたならどうする？")).toBeTruthy();
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

  it("他家に手牌が設定された問題は、その席の手牌が盤面に表向きで描画される", async () => {
    mockGetProblem.mockResolvedValue(makePost({ problem: makeOpponentHandsProblem() }));
    render(<ProblemAnswerScreen />);

    expect(await screen.findByText("テスト問題")).toBeTruthy();
    // 南家にしか無い牌（2索）が表向き＝牌ラベル付きで描画される（裏向きはラベル無し）。
    expect(screen.getByLabelText("2索")).toBeTruthy();
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
