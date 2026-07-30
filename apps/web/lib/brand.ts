// ブランド表記の単一真実源（web 内）。サイトのドメインは og-meta.ts の siteBaseUrl() が持つ。
// mobile のワードマークは RN 側 BrandMark に別置（アプリ名は app.json とネイティブ生成物名に
// 紐づくため web と束ねない）。
export const BRAND = "RAISHA";
export const COPYRIGHT = `© 2026 ${BRAND}`;
