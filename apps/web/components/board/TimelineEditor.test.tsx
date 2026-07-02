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
