// ============================================================
// eval runner — 実行ループ（クライアント注入可能・テスト済みの接着部）
// ------------------------------------------------------------
// eval-fixtures/cases/* を歩き、各ターゲットを read-river / read-hand
// （本番と同じ Zod 検証込み）で読む。正解ラベルがあれば採点し、
// 常に truth.draft.json（人が直して正解へ昇格するドラフト）を書き出す。
// 実 Gemini を叩く入口は run-eval.eval.ts（手動実行）だけ。
// ============================================================

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ImageRef } from "../../domain/kifu/analyzer";
import type { GeminiClient } from "../../infrastructure/gemini/gemini-client";
import { HAND_PROMPT_SINGLE } from "../../infrastructure/gemini/hand-prompt";
import { RIVER_PROMPT_SINGLE } from "../../infrastructure/gemini/river-prompt";
import { readHand } from "../../infrastructure/gemini/read-hand";
import { readRiverDirection } from "../../infrastructure/gemini/read-river";
import { aggregate, type AccuracyResult } from "../accuracy";
import { evaluateHandTarget, evaluateRiverTarget } from "../response-accuracy";
import {
  formatHandDraft,
  formatRiverTokens,
  parseTruthFile,
  resolveTargetImage,
  type TruthTarget,
} from "../truth";

export interface RunEvalOptions {
  /** cases ディレクトリ（配下の <case>/truth.json を対象にする）。 */
  casesDir: string;
  client: GeminiClient;
  riverModel: string;
  handModel: string;
  log?: (line: string) => void;
}

export interface RunEvalSummary {
  /** ドラフトを出せたターゲット数（=読み取り成功数）。 */
  drafted: number;
  /** 正解ラベルがあり採点できたターゲット数。 */
  evaluated: number;
  errors: string[];
  skipped: string[];
  /** 採点できたターゲット全体の集計（無ければ undefined）。 */
  total?: AccuracyResult;
}

interface TargetOutcome {
  draft: Record<string, unknown>;
  result?: AccuracyResult;
  warnings: string[];
  error?: string;
}

function loadImage(path: string): ImageRef {
  const buf = readFileSync(path);
  const mimeType = path.endsWith(".jpg") || path.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  return {
    data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    mimeType,
  };
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

export function reportLine(label: string, r: AccuracyResult): string {
  return (
    `${label}: 牌 ${r.tileCorrect}/${r.tiles} (${pct(r.tileAccuracy)})` +
    ` / 白旗なし誤読 ${r.misread}/${r.asserted} (${pct(r.misreadRate)})` +
    ` / リーチ ${r.riichiCorrect}/${r.riichiTotal} (${pct(r.riichiAccuracy)})`
  );
}

/** モデルが読めなかった牌（null）＝人が必ず埋める箇所をドラフトに残す。 */
function reviewNotes(tiles: { tile: string | null }[], area: string): string[] {
  return tiles
    .map((t, i) => ({ ...t, pos: i + 1 }))
    .filter((t) => t.tile === null)
    .map((t) => `${area}#${t.pos} 読めず(null)`);
}

export async function runEvalCases(options: RunEvalOptions): Promise<RunEvalSummary> {
  const { casesDir, client, riverModel, handModel } = options;
  const log = options.log ?? ((line: string) => console.log(line));

  const caseIds = readdirSync(casesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => existsSync(join(casesDir, id, "truth.json")));

  const labeledResults: AccuracyResult[] = [];
  const errors: string[] = [];
  const skipped: string[] = [];
  let drafted = 0;
  let evaluated = 0;

  for (const caseId of caseIds) {
    const caseDir = join(casesDir, caseId);
    const truth = parseTruthFile(JSON.parse(readFileSync(join(caseDir, "truth.json"), "utf8")));
    const outcomes: TargetOutcome[] = [];

    for (const target of truth.targets) {
      const imageRel = resolveTargetImage(truth, target);
      const imagePath = join(caseDir, imageRel);
      const label = `${caseId}/${target.kind}:${target.player}`;
      if (!existsSync(imagePath)) {
        skipped.push(`${label}（${imageRel} なし）`);
        log(`skip ${label}: 画像なし（${imageRel}）`);
        continue;
      }

      const outcome = await runTarget({
        target,
        image: loadImage(imagePath),
        imageRel,
        client,
        riverModel,
        handModel,
      });
      outcomes.push(outcome);

      if (outcome.error) {
        errors.push(`${label}: ${outcome.error}`);
        log(`NG ${label}: ${outcome.error}`);
        continue;
      }
      drafted += 1;
      if (outcome.result) {
        evaluated += 1;
        labeledResults.push(outcome.result);
        log(reportLine(label, outcome.result));
      } else {
        log(`draft ${label}: 正解ラベル未記入（truth.draft.json を直して昇格してください）`);
      }
      for (const w of outcome.warnings) log(`  ⚠ ${label}: ${w}`);
    }

    if (outcomes.length > 0) {
      writeFileSync(
        join(caseDir, "truth.draft.json"),
        `${JSON.stringify(
          {
            source: truth.source,
            note: "Gemini の読み（ドラフト）。全牌を目検で確認・修正して truth.json に貼ること。review は必ず埋める null 箇所。",
            targets: outcomes.map((o) => o.draft),
          },
          null,
          2,
        )}\n`,
      );
    }
  }

  const total = labeledResults.length > 0 ? aggregate(labeledResults) : undefined;
  if (total) {
    log("――――――――――――――――――――");
    log(reportLine(`全体（${evaluated} ターゲット）`, total));
  }
  log(`ドラフト出力: ${drafted} ターゲット / 採点: ${evaluated} ターゲット`);

  return { drafted, evaluated, errors, skipped, total };
}

async function runTarget(args: {
  target: TruthTarget;
  image: ImageRef;
  imageRel: string;
  client: GeminiClient;
  riverModel: string;
  handModel: string;
}): Promise<TargetOutcome> {
  const { target, image, imageRel, client } = args;
  try {
    if (target.kind === "river") {
      const res = await readRiverDirection(
        { client, prompt: RIVER_PROMPT_SINGLE, model: args.riverModel },
        image,
      );
      const sorted = [...res.discards].sort((a, b) => a.order - b.order);
      const draft = {
        kind: "river",
        player: target.player,
        image: imageRel,
        discards: formatRiverTokens(res),
        review: reviewNotes(sorted, "捨て牌"),
        notes: res.notes,
      };
      if (target.discards.length === 0) return { draft, warnings: [] };
      const { result, warnings } = evaluateRiverTarget(target.discards, res);
      return { draft, result, warnings };
    }

    const res = await readHand(
      { client, prompt: HAND_PROMPT_SINGLE, model: args.handModel },
      image,
    );
    const handDraft = formatHandDraft(res);
    const draft = {
      kind: "hand",
      player: target.player,
      image: imageRel,
      hand: handDraft.hand,
      melds: handDraft.melds,
      review: [
        ...reviewNotes(res.hand, "手牌"),
        ...res.melds.flatMap((m, mi) => reviewNotes(m.tiles, `鳴き#${mi + 1}`)),
      ],
      notes: res.notes,
    };
    if (target.hand.length === 0 && target.melds.length === 0) return { draft, warnings: [] };
    const { result, warnings } = evaluateHandTarget(target, res);
    return { draft, result, warnings };
  } catch (e) {
    return {
      draft: { kind: target.kind, player: target.player, image: imageRel, error: String(e) },
      warnings: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
