import { ProblemSchema, PROBLEM_SCHEMA_VERSION } from "@rigel/schema";
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
    counts: { "discard:1m:riichi": 2, "discard:5p": 1, "discard:5p:tsumogiri": 1 },
    total: 4,
    myChoiceKey: "discard:1m:riichi",
    myAction: { type: "discard", tile: "1m", riichi: true, tsumogiri: false },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProblemAnswerScreen: 何切る", () => {
  it("点数は牌譜と同じくネームプレート（席の横）に出す。盤面外の点数行は出さない", async () => {
    stubMe("free");
    const post = makeDiscardPost();
    post.problem = {
      ...post.problem,
      scores: { east: 25000, south: 11600, west: 38400, north: 25000 },
    };
    const { container } = renderScreen(post);
    await screen.findByText("あなたなら何を切る？");

    // ネームプレート（[data-seat] 内）に各席の点数が出る（牌譜ビューアと同一様式）。
    const seatText = Array.from(container.querySelectorAll("[data-seat]"))
      .map((el) => el.textContent)
      .join(" ");
    expect(seatText).toContain("11,600点");
    expect(seatText).toContain("38,400点");
    // 旧: 盤面外の「点数」ラベル行は出さない。
    expect(screen.queryByText("点数")).toBeNull();
  });

  it("点数未入力（scores=null）はネームプレートに点数を出さない", async () => {
    stubMe("free");
    const { container } = renderScreen(makeDiscardPost());
    await screen.findByText("あなたなら何を切る？");
    const seatText = Array.from(container.querySelectorAll("[data-seat]"))
      .map((el) => el.textContent)
      .join(" ");
    expect(seatText).not.toContain("点");
  });

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
        tsumogiri: false,
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
    // テンパイを維持する 4筒切りを選んでからリーチ（リーチはテンパイ時のみ押せる）。
    fireEvent.click(await screen.findByRole("button", { name: "4筒" }));
    fireEvent.click(screen.getByRole("button", { name: "リーチ" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));

    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p1", {
        type: "discard",
        tile: "4p",
        riichi: true,
        tsumogiri: false,
      }),
    );
    // 「出題者の答え（正解）」は出さない。自分の回答・出題者のコメント・みんなの分布を出す。
    expect(screen.queryByText(/出題者の答え/)).toBeNull();
    expect(screen.getAllByText(/4筒切り・リーチ/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ピンズの伸び/)).toBeTruthy();
    expect(await screen.findByText(/回答分布/)).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy(); // 2/4件
  });

  it("リーチは切る牌の選択でテンパイが維持されるときだけ押せる", async () => {
    stubMe("free");
    renderScreen(discardPost());
    const riichiBtn = (await screen.findByRole("button", { name: "リーチ" })) as HTMLButtonElement;

    // 切る牌を選ぶまでは押せない。
    expect(riichiBtn.disabled).toBe(true);

    // ノーテンになる 1萬切りでは押せない。
    fireEvent.click(screen.getByRole("button", { name: "1萬" }));
    expect(riichiBtn.disabled).toBe(true);

    // テンパイを維持する 4筒切りなら押せる。
    fireEvent.click(screen.getByRole("button", { name: "4筒" }));
    expect(riichiBtn.disabled).toBe(false);
    fireEvent.click(riichiBtn);
    expect(riichiBtn.getAttribute("aria-pressed")).toBe("true");

    // リーチON のままノーテン打牌へ選び直すと、リーチは解除されて押せなくなる。
    fireEvent.click(screen.getByRole("button", { name: "1萬" }));
    expect(riichiBtn.disabled).toBe(true);
    expect(riichiBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("ツモ牌をタップして回答するとツモ切りとして送信・表示される（分布ラベルも区別）", async () => {
    stubMe("free");
    renderScreen(discardPost());
    fireEvent.click(await screen.findByRole("button", { name: "5筒" })); // 右端＝ツモ牌
    expect(screen.getByText(/5筒ツモ切り/)).toBeTruthy(); // 選択中の手のラベル
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p1", {
        type: "discard",
        tile: "5p",
        riichi: false,
        tsumogiri: true,
      }),
    );
    // 分布では同じ 5p でも手出し（5筒切り）とツモ切り（5筒ツモ切り）が別の行になる。
    expect(await screen.findByText(/回答分布/)).toBeTruthy();
    expect(screen.getByText("5筒切り")).toBeTruthy();
    expect(screen.getAllByText(/5筒ツモ切り/).length).toBeGreaterThan(0);
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
        chiTiles: null,
        discard: "2m",
      }),
    );
  });

  it("チーは構成（345筒/456筒/567筒）を選んで回答できる（既定は最初の候補）", async () => {
    stubMe("free");
    const post = callPost({
      problem: ProblemSchema.parse({
        schemaVersion: PROBLEM_SCHEMA_VERSION,
        kind: "call",
        pov: "east",
        targetSeat: "south",
        seats: {
          east: {
            hand: [
              "1m",
              "2m",
              "3m",
              "4m",
              "5m",
              "6m",
              "7m",
              "8m",
              "9m",
              "3p",
              "4p",
              "6p",
              "7p",
            ].map((t) => ({ tile: t, confidence: 1 })),
          },
          south: { river: [{ order: 1, tile: "5p", confidence: 1 }] },
          west: {},
          north: {},
        },
      }),
    });
    renderScreen(post);
    fireEvent.click(await screen.findByRole("button", { name: "チー" }));
    // 構成候補が並び、既定は最初の候補（345筒）が選択済み。
    expect(screen.getByRole("button", { name: "345筒" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "567筒" }));
    fireEvent.click(screen.getByRole("button", { name: "1萬" }));
    fireEvent.click(screen.getByRole("button", { name: "回答する" }));
    await waitFor(() =>
      expect(h.answerProblemAction).toHaveBeenCalledWith("p2", {
        type: "call",
        call: "chi",
        chiTiles: ["5p", "6p", "7p"],
        discard: "1m",
      }),
    );
  });
});
