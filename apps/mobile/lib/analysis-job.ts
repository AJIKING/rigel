// 解析ジョブの開始後のポーリングと、開き直しで再開するための永続化
// （docs/plans/async-analysis.md）。解析は非同期（202 + jobId）になったため、
// 完了はここでポーリングして知る。予算（2s→5s→10s・10分打ち切り）は
// @rigel/ui の analysisPollDelayMs が単一実装。
// バックグラウンドでは RN の JS タイマーが止まるため、実質フォアグラウンドのみで動く。

import {
  parsePendingAnalysis,
  pollAnalysisOutcome,
  type AnalysisOutcome,
  type PendingAnalysisRecord,
} from "@rigel/ui";
import * as SecureStore from "expo-secure-store";
import { getAnalysisJob } from "./api";

export type { AnalysisOutcome };

const JOB_KEY = "rigel.analysisJob";

/** 永続レコードの形と検証は @rigel/ui（web の localStorage 版と共通）。 */
export type PendingAnalysis = PendingAnalysisRecord;

export async function savePendingAnalysis(pending: PendingAnalysis): Promise<void> {
  await SecureStore.setItemAsync(JOB_KEY, JSON.stringify(pending));
}

export async function loadPendingAnalysis(): Promise<PendingAnalysis | null> {
  const raw = await SecureStore.getItemAsync(JOB_KEY);
  return parsePendingAnalysis(raw);
}

export async function clearPendingAnalysis(): Promise<void> {
  await SecureStore.deleteItemAsync(JOB_KEY);
}

interface Clock {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/** ジョブを終端（done/failed）までポーリングする。ループ本体は @rigel/ui の
 *  pollAnalysisOutcome（web と共通。予算 2s→5s→10s・10分打ち切り・一時例外は再試行）。 */
export async function pollAnalysisJob(
  token: string,
  pending: PendingAnalysis,
  clock: Clock = realClock,
  /** true で中断（サインアウト等）。ジョブ自体はサーバー側で進む。 */
  shouldStop?: () => boolean,
): Promise<AnalysisOutcome> {
  return pollAnalysisOutcome(
    () => getAnalysisJob(token, pending.jobId),
    pending.startedAt,
    clock,
    shouldStop,
  );
}
