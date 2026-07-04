import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StatusScreen } from "./StatusScreen";

describe("StatusScreen", () => {
  it("404: コードと見出し・説明・トップへのリンクを表示する", () => {
    render(
      <StatusScreen
        code={404}
        title="ページが見つかりません"
        message="URL が間違っているか、ページが移動・削除された可能性があります。"
      />,
    );
    expect(screen.getByText("404")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "ページが見つかりません" })).toBeTruthy();
    expect(
      screen.getByText("URL が間違っているか、ページが移動・削除された可能性があります。"),
    ).toBeTruthy();
    const home = screen.getByRole("link", { name: "トップへ戻る" });
    expect(home.getAttribute("href")).toBe("/");
  });

  it("500: onRetry を渡すと再試行ボタンが出て、押すと呼ばれる", () => {
    const onRetry = vi.fn();
    render(
      <StatusScreen
        code={500}
        title="エラーが発生しました"
        message="時間をおいて再度お試しください。"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText("500")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "再試行する" });
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("onRetry を渡さなければ再試行ボタンは出ない", () => {
    render(<StatusScreen code={404} title="ページが見つかりません" message="説明" />);
    expect(screen.queryByRole("button", { name: "再試行する" })).toBeNull();
  });
});
