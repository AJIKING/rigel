import { describe, it, expect } from "vitest";
import { needsReview, REVIEW_CONFIDENCE_THRESHOLD } from "./index";

describe("needsReview（confidence → 人手確認の入口）", () => {
  it("読めなかった牌(null)は必ず要確認", () => {
    expect(needsReview({ tile: null, confidence: 0 })).toBe(true);
  });

  it("確信度が閾値未満なら要確認", () => {
    expect(needsReview({ tile: "1m", confidence: REVIEW_CONFIDENCE_THRESHOLD - 0.01 })).toBe(true);
  });

  it("確信度が十分高ければ確認不要", () => {
    expect(needsReview({ tile: "1m", confidence: 0.99 })).toBe(false);
  });
});
