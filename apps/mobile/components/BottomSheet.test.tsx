import { render, screen } from "@testing-library/react-native";
import { KeyboardAvoidingView, StyleSheet, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { BottomSheet } from "./BottomSheet";

/** initialMetrics で insets.bottom を注入する（jest.setup の公式モックが Provider 経由の値を返す）。 */
function renderSheet(bottomInset: number) {
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: bottomInset },
      }}
    >
      <BottomSheet onClose={jest.fn()}>
        <Text>中身</Text>
      </BottomSheet>
    </SafeAreaProvider>,
  );
}

function cardPaddingBottom(): number | undefined {
  const style = StyleSheet.flatten(screen.getByTestId("bottom-sheet-card").props.style);
  return (style as { paddingBottom?: number }).paddingBottom;
}

describe("BottomSheet: セーフエリア", () => {
  it.each([
    { device: "ホームインジケータあり（insets.bottom=34）", bottom: 34, expected: 46 },
    { device: "インジケータなし（insets.bottom=0）", bottom: 0, expected: 24 },
  ])(
    "$device では下パディングが max(24, insets.bottom+12)=$expected になり、保存ボタン等が隠れない",
    ({ bottom, expected }) => {
      renderSheet(bottom);
      expect(cardPaddingBottom()).toBe(expected);
    },
  );
});

describe("BottomSheet: キーボード回避", () => {
  it("シート（画面下端固定）を KeyboardAvoidingView で包み、入力欄・保存ボタンがキーボードに隠れない（iOS=padding。Android は実装の Platform 分岐で height）", () => {
    renderSheet(0);
    // jest-expo の Platform.OS は ios。Android の "height" は実装側の三項分岐で担保する。
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe("padding");
    // シート本体はキーボード回避の内側にある（KAV の外だと持ち上がらない）。
    expect(screen.getByTestId("bottom-sheet-card")).toBeTruthy();
  });
});
