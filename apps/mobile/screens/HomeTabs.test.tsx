import { fireEvent, render, screen } from "@testing-library/react-native";
import { HomeTabs } from "./HomeTabs";

// 各タブの中身はここでは関心外（スタブ化してタブ切替の配線だけを検証する）。
jest.mock("./PublicListScreen", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return { PublicListScreen: () => React.createElement(Text, null, "公開一覧画面") };
});
jest.mock("./ProblemsListScreen", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    ProblemsListScreen: ({ onOpenMine }: { onOpenMine: () => void }) =>
      React.createElement(
        Pressable,
        { onPress: onOpenMine },
        React.createElement(Text, null, "マイ何切るへ"),
      ),
  };
});
jest.mock("./MyPageScreen", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return {
    MyPageScreen: ({ segment }: { segment: string }) =>
      React.createElement(Text, null, `マイページ画面:${segment}`),
  };
});
jest.mock("./SettingsScreen", () => {
  const React = jest.requireActual("react");
  const { Text } = jest.requireActual("react-native");
  return { SettingsScreen: () => React.createElement(Text, null, "設定画面") };
});

describe("HomeTabs（ボトムタブ）", () => {
  it("タブは牌譜/何切る/マイページ/設定の4つで、作成タブは無い。初期表示は牌譜（公開一覧）", () => {
    render(<HomeTabs />);

    for (const label of ["牌譜", "何切る", "マイページ", "設定"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("作成")).toBeNull();
    expect(screen.queryByText("マイ牌譜")).toBeNull();
    expect(screen.getByText("公開一覧画面")).toBeTruthy();
  });

  it.each([
    ["何切る", "マイ何切るへ"],
    ["マイページ", "マイページ画面:kifu"],
    ["設定", "設定画面"],
  ])("「%s」タブを押すとその画面に切り替わる", (tabLabel, content) => {
    render(<HomeTabs />);

    fireEvent.press(screen.getByText(tabLabel));
    expect(screen.getByText(content)).toBeTruthy();
    expect(screen.queryByText("公開一覧画面")).toBeNull();
  });

  it("何切る一覧の「マイ何切る」導線はマイページタブを何切るセグメントで開く", () => {
    render(<HomeTabs />);

    fireEvent.press(screen.getByText("何切る"));
    fireEvent.press(screen.getByText("マイ何切るへ"));
    expect(screen.getByText("マイページ画面:problems")).toBeTruthy();
  });
});
