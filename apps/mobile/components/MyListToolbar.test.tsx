// マイページ共通ツールバー（[決定] 2026-07-29 オーナー: 再設計）。
// - 並び順は3択セグメントをやめ、現在値を出すボタン＋ボトムシートで選ぶ（幅を取らない）
// - お気に入り絞り込みはラベル付きチップ（アイコン単体では役割が伝わらなかった）
// - お気に入りタブでは onFavOnly を渡さない＝チップ自体を出さない（全部お気に入りなので無意味）
// - 右端の action スロットに各タブの主要アクション（＋新規）を置き、タブ間で並びを統一する

import { fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { MyListToolbar } from "./MyListToolbar";

describe("MyListToolbar（再設計）", () => {
  it("現在の並び順をボタンに表示し、シートで選ぶと onSort に渡って閉じる", () => {
    const onSort = jest.fn();
    render(<MyListToolbar sort="new" onSort={onSort} favOnly={false} onFavOnly={jest.fn()} />);

    const sortBtn = screen.getByLabelText("並び替え");
    expect(screen.getByText(/新しい順/)).toBeTruthy();

    fireEvent.press(sortBtn);
    fireEvent.press(screen.getByText("お気に入りが多い順"));

    expect(onSort).toHaveBeenCalledWith("fav");
    // 選択後はシートが閉じる（他の選択肢が消える）。
    expect(screen.queryByText("古い順")).toBeNull();
  });

  it("お気に入り絞り込みはラベル付きチップで、押すとトグルする", () => {
    const onFavOnly = jest.fn();
    render(<MyListToolbar sort="new" onSort={jest.fn()} favOnly={false} onFavOnly={onFavOnly} />);

    const chip = screen.getByLabelText("お気に入りのみ表示");
    expect(screen.getByText("お気に入り")).toBeTruthy();

    fireEvent.press(chip);
    expect(onFavOnly).toHaveBeenCalledWith(true);
  });

  it("onFavOnly を渡さなければチップを出さない（お気に入りタブ用）", () => {
    render(<MyListToolbar sort="new" onSort={jest.fn()} />);
    expect(screen.queryByLabelText("お気に入りのみ表示")).toBeNull();
  });

  it("並び替えシートはツールバー行の外に描画する（行内だと absolute overlay が行基準になり崩れる）", () => {
    render(<MyListToolbar sort="new" onSort={jest.fn()} favOnly={false} onFavOnly={jest.fn()} />);

    fireEvent.press(screen.getByLabelText("並び替え"));

    // シートのカードから親を辿っても、ツールバーの行（testID）には行き着かないこと。
    // 2026-07-29 実測: 行内に置くと overlay が行のサイズに閉じ込められて画面上部に潰れて出た。
    let node: { parent: unknown; props?: { testID?: string } } | null =
      screen.getByTestId("bottom-sheet-card");
    while (node) {
      expect(node.props?.testID).not.toBe("mylist-toolbar-row");
      node = node.parent as typeof node;
    }
  });

  it("action スロット（＋新規など）を同じ行に描画する", () => {
    render(
      <MyListToolbar
        sort="new"
        onSort={jest.fn()}
        favOnly={false}
        onFavOnly={jest.fn()}
        action={<Text>＋ 新規</Text>}
      />,
    );
    expect(screen.getByText("＋ 新規")).toBeTruthy();
  });
});
