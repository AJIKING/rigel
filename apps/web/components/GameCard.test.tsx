import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameCard } from "./GameCard";

describe("GameCard", () => {
  it("タイトル・バッジ・meta を表示する", () => {
    render(
      <GameCard
        title="卓1"
        badge={<span>公開</span>}
        meta={<>8局</>}
        faved={false}
        onToggleFav={() => {}}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByRole("heading", { name: "卓1" })).toBeTruthy();
    expect(screen.getByText("公開")).toBeTruthy();
    expect(screen.getByText("8局")).toBeTruthy();
  });

  it("お気に入りはカードを開かず toggle のみ、本体クリックで開く", () => {
    const onOpen = vi.fn();
    const onToggleFav = vi.fn();
    render(
      <GameCard
        title="卓1"
        meta={<>8局</>}
        faved={false}
        onToggleFav={onToggleFav}
        onOpen={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "お気に入り" }));
    expect(onToggleFav).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("heading", { name: "卓1" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("actions のボタンで Enter を押してもカード遷移は同時発火しない（キーは伝播の網に掛からない）", () => {
    const onOpen = vi.fn();
    const onRetry = vi.fn();
    render(
      <GameCard
        title="卓1"
        meta={<>8局</>}
        onOpen={onOpen}
        actions={
          <button type="button" onClick={onRetry}>
            もう一度解析
          </button>
        }
      />,
    );

    const retry = screen.getByRole("button", { name: "もう一度解析" });
    retry.focus();
    fireEvent.keyDown(retry, { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();

    // カード自身へのキー操作では従来どおり開く。
    const card = screen.getByRole("button", { name: /卓1/ });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
