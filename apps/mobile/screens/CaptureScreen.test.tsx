// 撮影画面の解析枠表示のテスト。枠は撮る前に見えることが重要
// （選んで送ってから 403 で知るのでは撮影の手間が無駄になる）。

import { render, screen } from "@testing-library/react-native";
import { CaptureScreen } from "./CaptureScreen";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useRoute: () => ({ params: undefined }),
}));

let mockAuth: {
  token: string | null;
  user: { plan: string; remainingCalls?: number; monthlyCallQuota?: number } | null;
};
jest.mock("../lib/auth", () => ({ useAuth: () => mockAuth }));

jest.mock("../lib/api", () => ({
  analyze: jest.fn(),
  createEmptyKifu: jest.fn(),
  createGame: jest.fn(),
}));
jest.mock("../lib/pick-image", () => ({ pickImage: jest.fn() }));

describe("CaptureScreen（解析枠の表示）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("有料プランには当月の残り解析枠を表示する", () => {
    mockAuth = { token: "t", user: { plan: "next", remainingCalls: 92, monthlyCallQuota: 100 } };
    render(<CaptureScreen />);

    expect(screen.getByText("解析枠 残り 92 / 100（今月）")).toBeTruthy();
  });

  it("free には解析枠を出さない（写真入力自体が無い）", () => {
    mockAuth = { token: "t", user: { plan: "free" } };
    render(<CaptureScreen />);

    expect(screen.queryByText(/解析枠/)).toBeNull();
  });
});
