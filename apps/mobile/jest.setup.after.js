// テストフレームワーク初期化後のセットアップ（setupFilesAfterEnv）。
// RNTL は import 時に expect を拡張するため、expect が定義される前の setupFiles では読めない。

import { configure } from "@testing-library/react-native";

// waitFor 等の非同期ユーティリティの上限。既定の 1000ms は CI だと足りない
// （turbo が全パッケージのテストを 4vCPU ランナーで同時実行するため CPU が枯渇し、
// MyProblems の削除テストが CI でのみ決定的に落ちた。2026-07-28 実測。ローカルでは
// Windows / Linux コンテナとも再現せず）。jest.config.js の testTimeout(20s) と同じ
// 「遅いランナーの実測に耐える値」とし、testTimeout より短く保つ。
configure({ asyncUtilTimeout: 10000 });
