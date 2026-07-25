import { fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import type { MyGameCard } from "../lib/api";
import { makePost } from "./problem-test-helpers";
import { MyPageScreen, type MyPageSegment } from "./MyPageScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: () => {},
}));

jest.mock("../lib/auth", () => ({
  useAuth: () => ({ token: "t", user: { plan: "free" } }),
}));

const myGames: MyGameCard[] = [
  {
    id: "g1",
    title: "東風戦",
    createdAt: "2026-07-01T00:00:00.000Z",
    kyokuCount: 4,
    publicCount: 0,
    draftCount: 0,
  },
];
jest.mock("../lib/use-kifu-data", () => ({
  useMyGames: () => ({ loading: false, games: myGames, sample: false, refetch: jest.fn() }),
}));

const mockGetMyProblems = jest.fn();
const mockListQuizSessions = jest.fn();
jest.mock("../lib/api", () => ({
  deleteGame: jest.fn(),
  getMyProblems: (...args: unknown[]) => mockGetMyProblems(...args),
  updateProblem: jest.fn(),
  deleteProblem: jest.fn(),
  listQuizSessions: (...args: unknown[]) => mockListQuizSessions(...args),
}));

/** MyPageScreen は制御コンポーネント（状態は HomeTabs 持ち）。テストでは薄い state で包む。 */
function Harness({ initial = "kifu" }: { initial?: MyPageSegment }) {
  const [segment, setSegment] = useState<MyPageSegment>(initial);
  return <MyPageScreen segment={segment} onChangeSegment={setSegment} />;
}

describe("MyPageScreen（マイページ：牌譜/何切るの切替）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetMyProblems.mockResolvedValue([makePost({ id: "p1", title: "公開中の問題" })]);
    mockListQuizSessions.mockResolvedValue([]);
  });

  it("初期表示は牌譜タブ（自分の半荘一覧が出て、何切るの内容は出ない）", () => {
    render(<Harness />);

    expect(screen.getByText("マイページ")).toBeTruthy();
    expect(screen.getByText("東風戦")).toBeTruthy();
    // 何切るタブの内容（問題カード）は出ない。※「＋ 新規」は牌譜タブにもあるため識別に使わない。
    expect(screen.queryByText("公開中の問題")).toBeNull();
    // タイトルバーはマイページ側が持つ（旧マイ牌譜のバーは出さない）。
    expect(screen.queryByText("マイ牌譜")).toBeNull();
  });

  it("セグメントを何切るに切り替えると問題一覧に、牌譜に戻すと半荘一覧に切り替わる", async () => {
    render(<Harness />);

    fireEvent.press(screen.getByText("何切る"));
    expect(await screen.findByText("公開中の問題")).toBeTruthy();
    expect(screen.getByText("＋ 新規")).toBeTruthy();
    expect(screen.queryByText("東風戦")).toBeNull();

    fireEvent.press(screen.getByText("牌譜"));
    expect(screen.getByText("東風戦")).toBeTruthy();
    expect(screen.queryByText("公開中の問題")).toBeNull();
  });

  it("セグメントを特訓に切り替えると特訓の履歴（サマリ・空状態）が出る", async () => {
    render(<Harness />);

    fireEvent.press(screen.getByText("特訓"));
    expect(await screen.findByText("挑戦回数")).toBeTruthy();
    expect(screen.getByText("まだ特訓の記録がありません")).toBeTruthy();
    expect(mockListQuizSessions).toHaveBeenCalledWith("t");
    expect(screen.queryByText("東風戦")).toBeNull();
    expect(screen.queryByText("公開中の問題")).toBeNull();
  });
});
