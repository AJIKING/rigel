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
  const { Text } = jest.requireActual("react-native");
  return { ProblemsListScreen: () => React.createElement(Text, null, "何切る一覧画面") };
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
jest.mock("./TrainingScreen", () => {
  const React = jest.requireActual("react");
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TrainingScreen: ({ onOpenSettings }: { onOpenSettings?: () => void }) =>
      React.createElement(
        Pressable,
        { onPress: onOpenSettings },
        React.createElement(Text, null, "特訓画面"),
      ),
  };
});

describe("HomeTabs（ボトムタブ）", () => {
  it("タブは牌譜/何切る/特訓/マイページ/設定の5つで、作成タブは無い。初期表示は牌譜（公開一覧）", () => {
    render(<HomeTabs />);

    for (const label of ["牌譜", "何切る", "特訓", "マイページ", "設定"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText("作成")).toBeNull();
    expect(screen.queryByText("マイ牌譜")).toBeNull();
    expect(screen.getByText("公開一覧画面")).toBeTruthy();
  });

  it.each([
    ["何切る", "何切る一覧画面"],
    ["特訓", "特訓画面"],
    ["マイページ", "マイページ画面:kifu"],
    ["設定", "設定画面"],
  ])("「%s」タブを押すとその画面に切り替わる", (tabLabel, content) => {
    render(<HomeTabs />);

    fireEvent.press(screen.getByText(tabLabel));
    expect(screen.getByText(content)).toBeTruthy();
    expect(screen.queryByText("公開一覧画面")).toBeNull();
  });

  it("特訓のアップグレード導線（onOpenSettings）は設定タブ（プラン変更 UI）を開く", () => {
    render(<HomeTabs />);

    fireEvent.press(screen.getByText("特訓"));
    fireEvent.press(screen.getByText("特訓画面"));
    expect(screen.getByText("設定画面")).toBeTruthy();
  });
});
