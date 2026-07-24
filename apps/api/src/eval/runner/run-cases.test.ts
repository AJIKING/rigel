import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GeminiClient } from "../../infrastructure/gemini/gemini-client";
import { runEvalCases } from "./run-cases";

// 1x1 PNG（中身は読まれない。存在チェックとバイト読みだけ通ればよい）。
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const riverJson = JSON.stringify({
  discards: [
    { order: 1, tile: "1z", riichi: false },
    { order: 2, tile: null, riichi: true }, // 読めず → review に載る
  ],
  notes: "glare",
});
const handJson = JSON.stringify({
  hand: [{ tile: "1m" }, { tile: null }],
  melds: [
    {
      type: "pon",
      tiles: [{ tile: "5z" }, { tile: "5z" }, { tile: "5z" }],
      from: "left",
    },
  ],
  notes: "",
});

/** プロンプト内容で河/手牌を出し分けるフェイク（呼び出しも記録する）。 */
class FakeClient implements GeminiClient {
  calls: { model: string }[] = [];
  async generateText({ model, prompt }: { model: string; prompt: string }): Promise<string> {
    this.calls.push({ model });
    return prompt.includes("discard") ? riverJson : handJson;
  }
}

describe("runEvalCases（eval runner の実行ループ）", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rigel-eval-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeCase(id: string, truth: unknown, images: string[]): void {
    const caseDir = join(dir, id);
    mkdirSync(join(caseDir, "crops"), { recursive: true });
    writeFileSync(join(caseDir, "truth.json"), JSON.stringify(truth));
    for (const img of images) writeFileSync(join(caseDir, img), PNG);
  }

  it("ラベル済みターゲットを採点し、全体集計とドラフトを出す", async () => {
    writeCase(
      "c1",
      {
        targets: [{ kind: "river", player: "bottom", discards: ["1z", "*5s"] }],
      },
      ["source.png"],
    );
    const client = new FakeClient();
    const summary = await runEvalCases({
      casesDir: dir,
      client,
      riverModel: "river-model",
      handModel: "hand-model",
      log: () => {},
    });

    expect(summary.errors).toEqual([]);
    expect(summary.evaluated).toBe(1);
    expect(summary.drafted).toBe(1);
    // 2枚目は正解 5s に対し予測 null（白旗）→ 牌正解率 0.5、白旗なし誤読は 0。
    expect(summary.total?.tileAccuracy).toBe(0.5);
    expect(summary.total?.misread).toBe(0);
    expect(client.calls).toEqual([{ model: "river-model" }]);

    const draft = JSON.parse(readFileSync(join(dir, "c1", "truth.draft.json"), "utf8"));
    expect(draft.targets[0].discards).toEqual(["1z", "*?"]);
    expect(draft.targets[0].review).toEqual(["捨て牌#2 読めず(null)"]);
    expect(draft.targets[0].notes).toBe("glare");
  });

  it("ラベル未記入はドラフトのみ（採点しない）", async () => {
    writeCase("c1", { targets: [{ kind: "hand", player: "bottom", hand: [], melds: [] }] }, [
      "source.png",
    ]);
    const summary = await runEvalCases({
      casesDir: dir,
      client: new FakeClient(),
      riverModel: "r",
      handModel: "h",
      log: () => {},
    });
    expect(summary.evaluated).toBe(0);
    expect(summary.drafted).toBe(1);
    const draft = JSON.parse(readFileSync(join(dir, "c1", "truth.draft.json"), "utf8"));
    expect(draft.targets[0].hand).toEqual(["1m", "?"]);
    expect(draft.targets[0].melds[0].tiles).toEqual(["5z", "5z", "5z"]);
  });

  it("画像が無いターゲットはスキップして続行する", async () => {
    writeCase(
      "c1",
      {
        targets: [
          { kind: "river", player: "bottom", discards: [] },
          { kind: "river", player: "top", discards: [] },
        ],
      },
      ["crops/bottom.png"], // top は無い
    );
    const summary = await runEvalCases({
      casesDir: dir,
      client: new FakeClient(),
      riverModel: "r",
      handModel: "h",
      log: () => {},
    });
    expect(summary.drafted).toBe(1);
    expect(summary.skipped).toEqual(["c1/river:top（crops/top.png なし）"]);
  });

  it("1ターゲットの失敗は errors に集めて他を続行する", async () => {
    writeCase("c1", { targets: [{ kind: "river", player: "bottom", discards: ["1z"] }] }, [
      "source.png",
    ]);
    writeCase("c2", { targets: [{ kind: "hand", player: "bottom", hand: [], melds: [] }] }, [
      "source.png",
    ]);
    const failing: GeminiClient = {
      async generateText({ prompt }) {
        if (prompt.includes("discard")) throw new Error("boom");
        return handJson;
      },
    };
    const summary = await runEvalCases({
      casesDir: dir,
      client: failing,
      riverModel: "r",
      handModel: "h",
      log: () => {},
    });
    expect(summary.errors).toEqual(["c1/river:bottom: boom"]);
    expect(summary.drafted).toBe(1);
  });
});
