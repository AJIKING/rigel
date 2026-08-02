// interfaces/http — レート制限（乱用・DoS 耐性）。
//
// 実体は Cloudflare の Rate Limiting binding（wrangler.toml の [[unsafe.bindings]]）だが、
// ここでは差し替え可能なポート（RateLimiter）として扱う。テストではフェイクを注入し、
// バインディング未設定（ローカル開発・ユニットテスト）では制限しない。
//
// 層別の考え方:
//   - 公開読み取り（認証不要）: IP 単位。誰でも叩けるので一番外側の防波堤。
//   - 書き込み（認証必須）  : userId 単位。D1 の行を増やす操作を人ごとに抑える。
//   - /analyze             : userId 単位で厳しめ。Gemini のコストと、枠の
//                            オーバーシュート（TOCTOU）を実質的に抑える。

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./shared";

/** Cloudflare Rate Limiting binding と同じ形（テストではフェイクを入れる）。 */
export interface RateLimiter {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

/** 超過時に返す待機秒数（バケットの窓と揃える）。 */
const RETRY_AFTER_SECONDS = 60;

/** 署名・共有秘密で守られており、送信元がこちらの制御外の受け口（制限しない）。 */
const WEBHOOK_PATHS = ["/billing/webhook", "/billing/revenuecat/webhook"];

/** リクエストからバケット（バインディング名）とキーを決める。 */
function bucketOf(
  method: string,
  path: string,
  userId: string | undefined,
  ip: string,
): { binding: "RL_ANALYZE" | "RL_WRITE" | "RL_READ"; key: string } | null {
  if (path === "/health" || WEBHOOK_PATHS.includes(path)) return null;
  // Gemini を呼ぶ解析系は厳しめの専用バケット（牌譜解析・何切るの写真解析・再解析）。
  if (
    path === "/analyze" ||
    path === "/problems/analyze" ||
    /^\/analyze\/jobs\/[^/]+\/retry$/.test(path)
  ) {
    return { binding: "RL_ANALYZE", key: `user:${userId ?? ip}` };
  }
  if (method === "GET" || method === "OPTIONS") return { binding: "RL_READ", key: `ip:${ip}` };
  // 書き込み。未ログイン（/auth/google・/kifu/validate 等）は IP で数える。
  return { binding: "RL_WRITE", key: userId ? `user:${userId}` : `ip:${ip}` };
}

/**
 * レート制限ミドルウェア。認証（userId 解決）の後・ルートの前に置く。
 * バインディングが無ければ素通し（ローカル開発・テスト）。
 */
export const rateLimit: MiddlewareHandler<AppEnv> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const bucket = bucketOf(c.req.method, c.req.path, c.get("userId"), ip);
  if (!bucket) return next();

  const limiter = (c.env as unknown as Record<string, RateLimiter | undefined>)[bucket.binding];
  if (!limiter) return next(); // 未設定＝制限なし（本番では wrangler.toml で必ず束ねる）

  const { success } = await limiter.limit({ key: bucket.key });
  if (success) return next();

  return c.json({ error: "too many requests" }, 429, {
    "retry-after": String(RETRY_AFTER_SECONDS),
  });
};
