// eval 専用の vitest 設定（手動実行: pnpm --filter api eval）。
// 実 Gemini を呼ぶため通常の `pnpm test`（*.test.ts のみ）からは分離する。
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/eval/runner/**/*.eval.ts"],
    // 画像 × 呼び出し数ぶん実 API を叩く（Pro 系は1呼び出しが分単位）ので大きく取る
    testTimeout: 1_800_000,
  },
});
