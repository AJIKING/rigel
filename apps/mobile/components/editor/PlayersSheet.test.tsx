import { PlayersSchema } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { PlayersSheet } from "./PlayersSheet";

const players = PlayersSchema.parse({
  east: { name: "多井", points: 120.3 },
  south: { name: "園田", points: -45.7 },
  west: {},
  north: {},
});

describe("PlayersSheet（選手情報の編集シート）", () => {
  it("保存済みの選手名・ポイントが初期表示される", () => {
    render(<PlayersSheet players={players} onSave={jest.fn()} onClose={jest.fn()} />);
    expect(
      (screen.getByLabelText("東家の選手名") as { props: { value: string } }).props.value,
    ).toBe("多井");
    expect(
      (screen.getByLabelText("東家のポイント") as { props: { value: string } }).props.value,
    ).toBe("120.3");
    expect(
      (screen.getByLabelText("南家のポイント") as { props: { value: string } }).props.value,
    ).toBe("-45.7");
  });

  it("編集して保存すると onSave に Players が渡る（名前 trim・数値化）", () => {
    const onSave = jest.fn();
    render(<PlayersSheet players={players} onSave={onSave} onClose={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText("東家のポイント"), "130.5");
    fireEvent.changeText(screen.getByLabelText("西家の選手名"), " 白鳥 ");
    fireEvent.press(screen.getByLabelText("選手情報を保存"));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        east: { name: "多井", points: 130.5 },
        south: { name: "園田", points: -45.7 },
        west: { name: "白鳥", points: 0 },
      }),
    );
  });

  it("全席を空にして保存すると null（記録しない対局へ戻す）", () => {
    const onSave = jest.fn();
    render(<PlayersSheet players={null} onSave={onSave} onClose={jest.fn()} />);
    fireEvent.press(screen.getByLabelText("選手情報を保存"));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("キャンセルで閉じる（onSave は呼ばれない）", () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<PlayersSheet players={players} onSave={onSave} onClose={onClose} />);
    fireEvent.press(screen.getByText("キャンセル"));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
