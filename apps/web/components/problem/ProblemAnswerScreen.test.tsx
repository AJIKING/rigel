import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ProblemPost } from "../../lib/api";
import { AuthProvider } from "../../lib/auth-context";
import { makeCallPost, makeDiscardPost, stubMe } from "./test-helpers";

const h = vi.hoisted(() => ({
  answerProblemAction: vi.fn(),
  getProblemStatsAction: vi.fn(),
}));
vi.mock("../../app/actions", () => h);
// 共通ヘッダ（AppHeader）が useRouter を使うためスタブする。
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ProblemAnswerScreen } from "./ProblemAnswerScreen";

const discardPost = makeDiscardPost;
const callPost = makeCallPost;

function renderScreen(post: ProblemPost) {
  return render(
    <AuthProvider>
      <ProblemAnswerScreen post={post} />
    </AuthProvider>,
  );
}

beforeEach(() => {
  h.answerProblemAction.mockReset().mockResolvedValue({ ok: true, status: 200 });
  h.getProblemStatsAction.mockReset().mockResolvedValue({
    counts: { "discard:1m:riichi": 2, "discard:5p": 1 },
    total: 3,
    myChoiceKey: "discard:1m:riichi",
    myAction: { type: "discard", tile: "1m", riichi: true },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemAnswerScreen: 何切る", () => {
  it("回答前は質問見出しを出し、解説・分布は出さない（正解は存在しない）", async () => {
    stubMe("free");
    renderScreen(discardPost());
    expect(await screen.findByText("何を切る？")).toBeTruthy();
    expect(screen.getByText("あなたなら何を切る？")).toBeTruthy(); // 質問見出し
    expect(screen.queryByText(/出題者の答え/)).toBeNull();
    expect(screen.queryByText(/ピンズの伸び/)).toBeNull();
    expect(screen.queryByText(/回答分布/)).toBeNull();
  });

  it("牌を選ぶと「選択中の手」が表示され、回答ボタンが有効になる", async () => {
    stubMe("free");
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "1萬" }));
    expect(screen.getByText(/1萬切り/)).toBeTruthy(); // 選択中の手のラベル
    expect((screen.getByRole("button", { name: "回答する" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("回答後に「回答をやり直す」で再選択でき、再回答は上書き送信される", async () => {
    stubMe("free");
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "1萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() => expect(h.answerProblemAction).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "回答をやり直す" }));
    fireEvent.click(screen.getByRole("button", { name: "2萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenLastCalledWith("p1", {
        type: "discard",
        tile: "2m",
        riichi: false,
      }),
    );
  });

  it("公開問題には共有ボタンが出る（下書きには出ない）", async () => {
    stubMe("free");
    renderScreen(discardPost());
    expect(await screen.findByRole("button", { name: "共有" })).toBeTruthy();
  });

  it("下書きプレビューには共有ボタンを出さない", async () => {
    stubMe("free");
    renderScreen(discardPost({ status: "draft" }));
    expect(await screen.findByText("下書き")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "共有" })).toBeNull();
  });

  it("牌を選びリーチを付けて回答すると、自分の回答・解説・分布（ログイン時）が出る", async () => {
    stubMe("free");
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "リーチ" }));
    fireEvent.click(screen.getByRole("button", { name: "1萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));

    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p1", {
        type: "discard",
        tile: "1m",
        riichi: true,
      }),
    );
    // 「出題者の答え（正解）」は出さない。自分の回答・出題者のコメント・みんなの分布を出す。
    expect(screen.queryByText(/出題者の答え/)).toBeNull();
    expect(screen.getAllByText(/1萬切り・リーチ/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ピンズの伸び/)).toBeTruthy();
    expect(await screen.findByText(/回答分布/)).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("未ログインでも回答体験はできるが、集計は呼ばずログイン導線を出す", async () => {
    stubMe(null);
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "5筒" })); // ツモ切り
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));

    expect(await screen.findByText(/あなたの回答/)).toBeTruthy();
    expect(h.answerProblemAction).not.toHaveBeenCalled();
    expect(screen.getByText(/ログインすると回答分布/)).toBeTruthy();
  });

  it("牌を選ぶまで回答ボタンは無効", async () => {
    stubMe("free");
    renderScreen(discardPost());
    const btn = (await screen.findByRole("button", { name: "回答する" })) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe("ProblemAnswerScreen: 鳴き判断", () => {
  it("スルー/ポン/チー/カンの選択式。スルーはそのまま回答できる", async () => {
    stubMe("free");
    renderScreen(callPost());
    fireEvent.click(await screen.findByRole("button", { name: "スルー" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() => expect(h.answerProblemAction).toHaveBeenCalledWith("p2", { type: "pass" }));
  });

  it("ポンを選ぶと切る牌の選択に進み、選んで回答できる", async () => {
    stubMe("free");
    renderScreen(callPost());
    fireEvent.click(await screen.findByRole("button", { name: "ポン" }));
    // 切る牌を選ぶまでは回答できない。
    expect((screen.getByRole("button", { name: "回答する" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "2萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p2", {
        type: "call",
        call: "pon",
        discard: "2m",
      }),
    );
  });
});
