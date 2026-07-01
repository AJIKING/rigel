import { describe, expect, it } from "vitest";
import { buildAnalyzeForm } from "./analyze-form";

function file(name: string): File {
  return new File(["x"], name, { type: "image/jpeg" });
}

describe("buildAnalyzeForm", () => {
  it("河・カメラ下家席・各家の手牌を API のフィールド名で詰める", () => {
    const river = file("river.jpg");
    const bottom = file("b.jpg");
    const right = file("r.jpg");
    const form = buildAnalyzeForm({
      river,
      cameraBottomSeat: "east",
      hands: { bottom, right },
    });
    expect(form.get("river")).toBe(river);
    expect(form.get("cameraBottomSeat")).toBe("east");
    expect(form.get("hand_bottom")).toBe(bottom);
    expect(form.get("hand_right")).toBe(right);
    // 渡していない家のフィールドは付かない。
    expect(form.get("hand_top")).toBeNull();
    expect(form.get("hand_left")).toBeNull();
  });

  it("gameId を渡したときだけ gameId フィールドを付ける", () => {
    const base = { river: file("r.jpg"), cameraBottomSeat: "south" as const, hands: {} };
    expect(buildAnalyzeForm(base).get("gameId")).toBeNull();
    expect(buildAnalyzeForm({ ...base, gameId: "g1" }).get("gameId")).toBe("g1");
  });
});
