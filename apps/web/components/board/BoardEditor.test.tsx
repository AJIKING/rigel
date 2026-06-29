import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../../lib/auth-context";
import { BoardEditor } from "./BoardEditor";

describe("BoardEditor", () => {
  it("未ログインでは編集にログインが必要と表示する", async () => {
    render(
      <AuthProvider>
        <BoardEditor gameId="g1" logId="l1" />
      </AuthProvider>,
    );
    expect(await screen.findByText(/ログイン/)).toBeTruthy();
  });
});
