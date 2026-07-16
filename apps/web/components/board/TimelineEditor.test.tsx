import { KifuSchema, type Kifu, type Seat } from "@rigel/schema";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineEditor } from "./TimelineEditor";

const NAMES: Record<Seat, string> = { east: "", south: "", west: "", north: "" };

const disc = (seat: Seat, tile: string, tsumogiri = false) => ({
  kind: "discard" as const,
  seat,
  draw: null,
  tile,
  tsumogiri,
  riichi: false,
  confidence: 1,
});

const kifu = (timeline: unknown[]): Kifu =>
  KifuSchema.parse({
    schemaVersion: "1.0.0",
    capturedAt: "2026-06-28T00:00:00.000Z",
    seats: { east: {}, south: {}, west: {}, north: {} },
    meta: { dealer: "east" },
    timeline,
  });

describe("TimelineEditor", () => {
  it("打牌イベントと巡目セパレータを表示する", () => {
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "1m"), disc("south", "2p")])}
        dealer="east"
        names={NAMES}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("1巡目")).toBeTruthy();
    expect(screen.getAllByText("手出し").length).toBe(2);
  });

  it("＋打牌は東南西北×巡目を順に埋める（必ず新巡目・東にならない）", () => {
    const onChange = vi.fn();
    // 既に 東・南 が入っている → 次の追加は「西」（新巡目・東ではない）。
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "1m"), disc("south", "2p")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("＋打牌"));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(3);
    expect(next.timeline[2]).toMatchObject({ kind: "discard", seat: "west" });
  });

  it("削除するとその打牌を除いた kifu で onChange が呼ばれる", () => {
    const onChange = vi.fn();
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "1m"), disc("south", "2p")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("削除")[0]!);
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]).toMatchObject({ seat: "south", tile: "2p" });
  });

  it("打牌の牌を開いて「クリア（なし）」で tile が null になる（取り消し）", () => {
    const onChange = vi.fn();
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "1m")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("打")); // 打の牌ボックスを開く
    fireEvent.click(screen.getByText("クリア（なし）"));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline[0]).toMatchObject({ kind: "discard", tile: null });
  });

  it("「鳴き」ボタンは鳴いた人の選択メニューを開き、選ぶと鳴き行＋切った牌の行が入る", () => {
    const onChange = vi.fn();
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "5p")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("鳴きなし"));
    // メニュー（なし/南家/西家/北家。捨て主の東家は出ない）から南家を選ぶ。
    expect(screen.queryByRole("button", { name: "東家" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "南家" }));
    const next = onChange.mock.calls[0]![0] as Kifu;
    // 鳴き印＋鳴き行（ポン・from=捨て主）＋鳴いた人の打牌行（切った牌は後で選ぶ）が入る。
    expect(next.timeline).toHaveLength(3);
    expect(next.timeline[0]).toMatchObject({ kind: "discard", calledBy: "south" });
    expect(next.timeline[1]).toMatchObject({
      kind: "meld",
      seat: "south",
      meld: { type: "pon", from: "east" },
    });
    expect(next.timeline[2]).toMatchObject({ kind: "discard", seat: "south", tile: null });
    expect(next.seats.east.river[0]).toMatchObject({ tile: "5p", calledBy: "south" });
  });

  it("メニューの「なし」で解除でき、連動の鳴き行・未入力の打牌行も消える", () => {
    const onChange = vi.fn();
    const meld = {
      kind: "meld" as const,
      seat: "south" as const,
      meld: {
        type: "pon" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "east" as const,
      },
    };
    const empty = { ...disc("south", "1m"), tile: null };
    render(
      <TimelineEditor
        kifu={kifu([{ ...disc("east", "5p"), calledBy: "south" }, meld, empty])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("鳴き→南家"));
    fireEvent.click(screen.getByRole("button", { name: "なし" }));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(next.seats.south.melds).toHaveLength(0);
  });

  it("鳴きの表示は選手名を優先する（鳴き→名前。無名は◯家のまま）", () => {
    render(
      <TimelineEditor
        kifu={kifu([{ ...disc("east", "5p"), calledBy: "south" }])}
        dealer="east"
        names={{ ...NAMES, south: "太郎" }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("鳴き→太郎")).toBeTruthy();
  });

  it("鳴きの「から」を変えると鳴き元の捨て牌に鳴き印が付く（手順→捨て牌の同期）", () => {
    const onChange = vi.fn();
    const meld = {
      kind: "meld" as const,
      seat: "south" as const,
      meld: {
        type: "pon" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "north" as const,
      },
    };
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "5p"), meld])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    // から: 北→東（自席=南は飛ばす）。東の直前の打牌（5p）に鳴き印が付く。
    fireEvent.click(screen.getByRole("button", { name: /から/ }));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline[0]).toMatchObject({ kind: "discard", calledBy: "south" });
    expect(next.seats.east.river[0]?.calledBy).toBe("south");
  });

  it("鳴き行を削除すると鳴き印も解除される", () => {
    const onChange = vi.fn();
    const meld = {
      kind: "meld" as const,
      seat: "south" as const,
      meld: {
        type: "pon" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "east" as const,
      },
    };
    render(
      <TimelineEditor
        kifu={kifu([{ ...disc("east", "5p"), calledBy: "south" }, meld])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getAllByLabelText("削除")[1]!);
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(next.seats.east.river[0]?.calledBy).toBeNull();
  });

  it("鳴き行に「打」ボックスがあり、切った牌を同じ行で選べる（無ければ直後に挿入）", () => {
    const onChange = vi.fn();
    const meld = {
      kind: "meld" as const,
      seat: "west" as const,
      meld: {
        type: "pon" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "east" as const,
      },
    };
    render(<TimelineEditor kifu={kifu([meld])} dealer="east" names={NAMES} onChange={onChange} />);
    fireEvent.click(screen.getByText("打")); // 鳴き行の打ボックス
    fireEvent.click(screen.getByText("索"));
    fireEvent.click(screen.getByRole("button", { name: "9索" }));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(2);
    expect(next.timeline[1]).toMatchObject({ kind: "discard", seat: "west", tile: "9s" });
  });

  it("カンの鳴き行では嶺上ツモも選べる", () => {
    const onChange = vi.fn();
    const kan = {
      kind: "meld" as const,
      seat: "west" as const,
      meld: {
        type: "kan_open" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "east" as const,
      },
    };
    render(<TimelineEditor kifu={kifu([kan])} dealer="east" names={NAMES} onChange={onChange} />);
    fireEvent.click(screen.getByText("嶺上"));
    fireEvent.click(screen.getByText("索"));
    fireEvent.click(screen.getByRole("button", { name: "6索" }));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline[1]).toMatchObject({ kind: "discard", seat: "west", draw: "6s" });
  });

  it("鳴きと切った牌は1行に併合され、行の削除で両方消える（鳴き印も解除）", () => {
    const onChange = vi.fn();
    const meld = {
      kind: "meld" as const,
      seat: "west" as const,
      meld: {
        type: "pon" as const,
        tiles: [{ tile: "5p" }, { tile: "5p" }, { tile: "5p" }],
        from: "east" as const,
      },
    };
    render(
      <TimelineEditor
        kifu={kifu([{ ...disc("east", "5p"), calledBy: "west" }, meld, disc("west", "9m")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    // 3イベントだが表示は2行（打牌行＋鳴き行）。
    expect(screen.getAllByLabelText("削除")).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText("削除")[1]!);
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline).toHaveLength(1);
    expect(next.timeline[0]).toMatchObject({ kind: "discard", calledBy: null });
    expect(next.seats.west.melds).toHaveLength(0);
    expect(next.seats.west.river).toHaveLength(0);
  });

  it("手出し/ツモ切りトグルで tsumogiri が反転する", () => {
    const onChange = vi.fn();
    render(
      <TimelineEditor
        kifu={kifu([disc("east", "1m")])}
        dealer="east"
        names={NAMES}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("手出し"));
    const next = onChange.mock.calls[0]![0] as Kifu;
    expect(next.timeline[0]).toMatchObject({ tsumogiri: true });
  });
});
