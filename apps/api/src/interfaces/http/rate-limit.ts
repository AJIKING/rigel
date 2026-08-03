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
//   - /auth/*              : IP 単位で厳しめ（未ログインなので userId が無い）。
//                            審査ログインの合言葉・盗んだ idToken の総当たり/試行を抑える
//                            （[決定] 2026-08-03 オーナー承認。汎用書き込み枠だと 60回/分と緩い）。

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
): { binding: "RL_ANALYZE" | "RL_AUTH" | "RL_WRITE" | "RL_READ"; key: string } | null {
  if (path === "/health" || WEBHOOK_PATHS.includes(path)) return null;
  // 認証（ログイン・審査コード・Apple の form_post 中継）。未ログインなので IP で数える。
  if (path.startsWith("/auth/")) return { binding: "RL_AUTH", key: `ip:${ip}` };
  // Gemini を呼ぶ解析系は厳しめの専用バケット（牌譜解析・何切るの写真解析・再解析）。
  if (
    path === "/analyze" ||
    path === "/problems/analyze" ||
    /^\/analyze\/jobs\/[^/]+\/retry$/.test(path)
  ) {
    return { binding: "RL_ANALYZE", key: `user:${userId ?? ip}` };
  }
  if (method === "GET" || method === "OPTIONS") return { binding: "RL_READ", key: `ip:${ip}` };
  // 書き込み。未ログイン（/kifu/validate 等）は IP で数える。
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

  // ⚠️ この層は **best-effort** で、単独の防波堤にはならない（2026-08-03 本番実測）:
  // カウンタは isolate 単位で、**接続を張り直すたびに別 isolate に当たってリセットされる**
  // （同一 keep-alive 接続なら 2 回目以降きちんと block、毎回新規接続だと 44 連投でも素通し）。
  // 効くのは「同じ接続を使う普通のクライアントの暴走」まで。意図的に接続を張り替える
  // 総当たり・DoS には**ゾーンの WAF レートリミットルール**（エッジで IP 単位に強制）が要る。
  // 本丸の防御は別にある: 解析コストは月次 Gemini 枠、認証は署名検証＋定数時間比較。
  const { success } = await limiter.limit({ key: bucket.key });
  if (success) return next();

  return c.json({ error: "too many requests" }, 429, {
    "retry-after": String(RETRY_AFTER_SECONDS),
  });
};
