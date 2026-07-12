import type { MetadataRoute } from "next";
import { siteBaseUrl } from "../lib/og-meta";

// クロール方針: 公開ページだけ許可。本人専用・内部ルートはクロール自体を止める。
// （要ログインページは /login へリダイレクトし、/login 側は meta noindex。）
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: ["/api/", "/dev/", "/mypage", "/settings", "/login"],
    },
    sitemap: `${siteBaseUrl()}/sitemap.xml`,
  };
}
