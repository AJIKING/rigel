// interfaces/http — 入口の「量」の上限。
//
// スキーマ（@rigel/schema の KIFU_LIMITS）が「中身の量」を守るのに対し、ここは
// HTTP レイヤで「そもそも受け取る量」を守る。Cloudflare Workers の既定（~100MB）任せだと、
// 認証済みユーザーが D1 の行や Worker の CPU/メモリを安価に焼ける。

/** JSON ボディの上限（Kifu 1件の現実的サイズの数倍）。超過は 413。 */
export const BODY_LIMIT_BYTES = 256 * 1024;

/** 解析画像1枚の上限バイト数（スマホの高解像度写真を許容しつつ青天井にしない）。 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 解析で受け取る画像の最大枚数（河1枚＋手牌4枚）。 */
export const MAX_IMAGE_COUNT = 5;

/**
 * multipart（解析）ルートのボディ上限。個々の画像は isValidImageFile（8MB/枚）で見るが、
 * それは formData() が**全体をバッファした後**の判定なので、入口の総量もここで止める
 * （Workers 既定 ~100MB 任せだと認証済みユーザーが安価にメモリ/CPU を焼ける）。
 * 8MB × 5枚 + multipart のオーバーヘッド、に安全余裕を足した値。
 * 小さすぎると実写真が全滅する（256KB を掛けて全滅させた回帰あり・2026-08-01）。
 */
export const MULTIPART_LIMIT_BYTES = 48 * 1024 * 1024;

/** 受け付ける画像 MIME（許可リスト。任意バイト列を「画像」として Gemini に送らない）。 */
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** アップロードされたファイルが解析画像として妥当か（バイトを読む前に判定する）。 */
export function isValidImageFile(file: File): boolean {
  return (
    file.size > 0 &&
    file.size <= MAX_IMAGE_BYTES &&
    (ALLOWED_IMAGE_MIME as readonly string[]).includes(file.type)
  );
}

/** multipart のフィールドを File として安全に取り出す（文字列などは null）。 */
export function asFile(value: unknown): File | null {
  return value instanceof File ? value : null;
}

/** File → 解析用 ImageRef（バイト列＋MIME）。永続化はしない前提で使い捨てる。 */
export async function toImageRef(file: File): Promise<{ data: ArrayBuffer; mimeType: string }> {
  return { data: await file.arrayBuffer(), mimeType: file.type || "image/jpeg" };
}
