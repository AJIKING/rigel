import { ProblemSchema } from "@rigel/schema";
import { type ProblemPost } from "./api";

// 何切る問題を画面へ渡す前の正規化（旧データに既定を埋める）。
// 信頼ゲート: 検証を通っていない問題データを下流に流さない。

/** 1件の正規化。壊れたデータは例外（詳細ページは 404 に落とす）。 */
export function normalizeProblemPost(post: ProblemPost): ProblemPost {
  return { ...post, problem: ProblemSchema.parse(post.problem) };
}

/** 一覧の正規化。壊れた1件はスキップして全体を落とさない。 */
export function normalizeProblemPosts(posts: ProblemPost[]): ProblemPost[] {
  return posts.flatMap((p) => {
    const parsed = ProblemSchema.safeParse(p.problem);
    return parsed.success ? [{ ...p, problem: parsed.data }] : [];
  });
}
