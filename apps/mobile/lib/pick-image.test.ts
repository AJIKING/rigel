import { Alert, Linking } from "react-native";
import { pickImage } from "./pick-image";

jest.mock("expo-image-picker", () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const picker = jest.requireMock("expo-image-picker") as {
  requestMediaLibraryPermissionsAsync: jest.Mock;
  launchImageLibraryAsync: jest.Mock;
};

describe("pickImage（写真選択の権限ハンドリング）", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined as never);
  });

  it("許可済みなら選択したファイルを返す", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    picker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file://a.jpg", fileName: "a.jpg", mimeType: "image/jpeg" }],
    });
    const result = await pickImage();
    expect(result).toEqual({
      status: "picked",
      file: { uri: "file://a.jpg", name: "a.jpg", type: "image/jpeg" },
    });
  });

  it("選択をキャンセルしたら canceled", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: true,
      canAskAgain: true,
    });
    picker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickImage()).toEqual({ status: "canceled" });
  });

  it("拒否済み（canAskAgain=false）は設定アプリへの誘導を出して denied", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });
    const result = await pickImage();
    expect(result).toEqual({ status: "denied" });
    // OS はもうダイアログを出さないので、設定アプリへ誘導する UI を必ず出す。
    expect(Alert.alert).toHaveBeenCalled();
    expect(picker.launchImageLibraryAsync).not.toHaveBeenCalled();
  });

  it("いま拒否した（canAskAgain=true）ときは誘導なしで denied", async () => {
    picker.requestMediaLibraryPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    expect(await pickImage()).toEqual({ status: "denied" });
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
