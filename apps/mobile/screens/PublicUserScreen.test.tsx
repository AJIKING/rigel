import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PublicProfile } from "../lib/api";
import { PublicUserScreen } from "./PublicUserScreen";

const mockNavigate = jest.fn();
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { idOrHandle: "kuro" } }),
}));

const mockGetPublicProfile = jest.fn<Promise<PublicProfile | null>, unknown[]>();
jest.mock("../lib/api", () => ({
  getPublicProfile: (...args: unknown[]) => mockGetPublicProfile(...args),
}));

const mockToggleFav = jest.fn();
jest.mock("../lib/use-favorites", () => ({
  useFavorites: () => ({
    apply: (cards: unknown[]) => cards,
    toggle: mockToggleFav,
    error: null,
  }),
}));

function makeProfile(over: Partial<PublicProfile> = {}): PublicProfile {
  return {
    id: "u9",
    handle: "kuro",
    displayName: "くろ",
    games: [
      {
        id: "g1",
        ownerId: "u9",
        ownerHandle: "kuro",
        ownerName: "くろ",
        title: "公開半荘",
        createdAt: "2026-07-01T00:00:00.000Z",
        kyokuCount: 4,
        firstLogId: "l1",
        favoriteCount: 2,
        viewerFaved: false,
      },
    ],
    ...over,
  };
}

describe("PublicUserScreen（公開ユーザーページ。web /u と対。Phase D）", () => {
  beforeEach(() => jest.clearAllMocks());

  it("表示名・@handle・公開牌譜一覧を出し、カードでビューアへ遷移する", async () => {
    mockGetPublicProfile.mockResolvedValue(makeProfile());
    render(<PublicUserScreen />);

    expect(await screen.findByText("くろ")).toBeTruthy();
    expect(screen.getByText("@kuro")).toBeTruthy();
    expect(screen.getByText("公開半荘")).toBeTruthy();

    fireEvent.press(screen.getByText("公開半荘"));
    expect(mockNavigate).toHaveBeenCalledWith("PublicGame", { gameId: "g1", logId: "l1" });
  });

  it("カードの★でお気に入りを付け外しできる（サーバー保存の toggle）", async () => {
    mockGetPublicProfile.mockResolvedValue(makeProfile());
    render(<PublicUserScreen />);
    await screen.findByText("公開半荘");

    fireEvent.press(screen.getByLabelText("お気に入りに追加/解除（2件）"));
    expect(mockToggleFav).toHaveBeenCalledWith("game", expect.objectContaining({ id: "g1" }));
  });

  it("見つからないユーザーは案内を出す（web と同一文言）", async () => {
    mockGetPublicProfile.mockResolvedValue(null);
    render(<PublicUserScreen />);

    expect(await screen.findByText("このユーザーは見つからないか、非公開です。")).toBeTruthy();
  });

  it("公開牌譜が無ければ空状態の案内を出す", async () => {
    mockGetPublicProfile.mockResolvedValue(makeProfile({ games: [] }));
    render(<PublicUserScreen />);

    expect(await screen.findByText("公開されている牌譜がまだありません。")).toBeTruthy();
  });
});
