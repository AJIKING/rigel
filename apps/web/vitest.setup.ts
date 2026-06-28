import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// 各テスト後に DOM を片付ける（描画が次のテストへ漏れないように）。
afterEach(() => {
  cleanup();
});
