// lib/og-meta — 共有ページ（公開ビューア・何切る・プロフィール）の <title>/OGP/Twitter
// メタデータを組み立てる純粋関数。非公開・不存在（null）ではサイト既定にフォールバックし、
// 対象の情報を一切含めない（プライバシー: 非公開データの存在をメタデータから漏らさない）。

import { ProblemSchema, type Tile } from "@rigel/schema";
import { PROBLEM_KIND_LABELS, problemHandTiles, problemRoundLabel } from "@rigel/ui";
import { BRAND } from "./brand";
import { fmtDateSlash } from "./format";

/** メタデータに必要な最小限の公開半荘情報（PublicGameDetail のサブセット）。 */
export interface PublicGameSummary {
  game: { id: string; title: string; createdAt: string };
  owner: { id: string; handle: string | null; displayName: string };
  logs: readonly unknown[];
}

/** Next.js の Metadata に構造的に代入できる共有メタデータ（テストで card 等へ直接
 *  アクセスできるよう、union の広い Metadata 型ではなく必要形だけを持つ）。 */
export interface ShareMetadata {
  title: string;
  description: string;
  /** 公開ページの正規URL（相対。metadataBase で絶対化される）。 */
  alternates?: { canonical: string };
  /** 検索エンジンに載せないページ（下書きなど）だけ noindex を立てる。 */
  robots?: { index: false };
  openGraph?: {
    title: string;
    description: string;
    siteName: string;
    url: string;
    type: "article" | "profile";
  };
  twitter?: { card: "summary_large_image" | "summary"; title: string; description: string };
}

// サイト既定（root layout と共有する単一ソース）。
export const DEFAULT_TITLE = "麻雀牌譜";
export const DEFAULT_DESCRIPTION = "実物の麻雀卓を撮った写真から牌譜ドラフトを生成する";

/** メタデータの絶対URL解決に使うサイトの基準URL。
 *  api-server.ts と同じ流儀で env（空文字は未設定扱い）→ 本番ドメインの順に解決する。 */
export function siteBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://raisha.jp";
}

/** 表示用のサイトホスト名（例: "raisha.jp"）。LP の OGP モック等、ドメインを
 *  文字として見せる場所はここから導出し、siteBaseUrl との乖離を防ぐ。 */
export function siteHost(): string {
  return new URL(siteBaseUrl()).host;
}

/** 非公開・不存在（null）のフォールバック。対象の情報を一切含めない。 */
function siteDefaultMeta(): ShareMetadata {
  return { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION };
}

/** 公開ページ共通の共有メタデータ（canonical・OGP・Twitter カードを一括で組む）。 */
function shareMeta(
  title: string,
  description: string,
  url: string,
  opts: {
    type: NonNullable<ShareMetadata["openGraph"]>["type"];
    card: NonNullable<ShareMetadata["twitter"]>["card"];
  },
): ShareMetadata {
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, siteName: BRAND, url, type: opts.type },
    twitter: { card: opts.card, title, description },
  };
}

/** ビューアと同じ無題表記。 */
const UNTITLED = "（無題の半荘）";

/** ビューアと同じ作者表記（handle が無ければ id 先頭6文字）。 */
function authorOf(owner: PublicGameSummary["owner"]): string {
  return `@${owner.handle ?? owner.id.slice(0, 6)}`;
}

/** ビューアと同じタイトル表記（空タイトルは無題）。 */
function titleOf(detail: PublicGameSummary): string {
  return detail.game.title || UNTITLED;
}

/** 半荘の要約文言「全N局・YYYY/MM/DD」。description と OG 画像カードで共用する。 */
function gameInfo(detail: PublicGameSummary): string {
  return `全${detail.logs.length}局・${fmtDateSlash(detail.game.createdAt)}`;
}

/** 公開半荘の共有メタデータ（<title>・description・OGP/Twitter カード）。 */
export function buildGameMetadata(detail: PublicGameSummary | null): ShareMetadata {
  if (!detail) return siteDefaultMeta();
  const description = `${authorOf(detail.owner)} の牌譜（${gameInfo(detail)}）をブラウザで再生できます。`;
  return shareMeta(titleOf(detail), description, `/k/${detail.game.id}`, {
    type: "article",
    card: "summary_large_image", // /k は opengraph-image で動的OG画像を生成している
  });
}

/** メタデータに必要な最小限の何切る情報（ProblemPost のサブセット）。 */
export interface ProblemMetaInput {
  id: string;
  title: string;
  status: "draft" | "published";
}

/** 画面（ProblemAnswerScreen 等）と同じ無題表記。 */
const UNTITLED_PROBLEM = "（無題の問題）";

/** 何切る回答ページ（/p/[id]）の共有メタデータ。
 *  published は OGP つきで公開、draft は所有者のタブ表示用タイトルのみ（noindex・OGP なし）。 */
export function buildProblemMetadata(post: ProblemMetaInput | null): ShareMetadata {
  if (!post) return siteDefaultMeta();
  const title = post.title || UNTITLED_PROBLEM;
  const description = "何切る問題。あなたの一打を選んで、みんなの回答分布と比べられます。";
  if (post.status !== "published") return { title, description, robots: { index: false } };
  // /p は opengraph-image で手牌カードを動的生成する（/k と同じ流儀）。
  return shareMeta(title, description, `/p/${post.id}`, {
    type: "article",
    card: "summary_large_image",
  });
}

/** OG画像カードに必要な最小限の何切る情報（problem は未検証の生JSON）。 */
export interface ProblemOgInput extends ProblemMetaInput {
  problem: unknown;
}

/** 何切るOG画像カードの内容（タイトル・種別/局情報・理牌済み手牌＋ツモ牌）。
 *  文言と牌の選定をここで一元化し、画像レンダラ（opengraph-image）はレイアウトだけを担う。
 *  信頼ゲート: problem は ProblemSchema 検証を通った場合のみ手牌を出す。
 *  下書き・不存在は汎用カードで問題情報を一切漏らさない。 */
export function problemOgCard(post: ProblemOgInput | null): {
  title: string;
  info: string;
  hand: Tile[];
  drawn: Tile | null;
} {
  const generic = {
    title: "何切る",
    info: "あなたの一打を選んで、みんなの回答分布と比べよう",
    hand: [] as Tile[],
    drawn: null as Tile | null,
  };
  if (!post || post.status !== "published") return generic;
  const title = post.title || UNTITLED_PROBLEM;
  const parsed = ProblemSchema.safeParse(post.problem);
  if (!parsed.success) return { ...generic, title };
  const problem = parsed.data;
  return {
    title,
    hand: problemHandTiles(problem),
    info: `${PROBLEM_KIND_LABELS[problem.kind]}・${problemRoundLabel(problem.meta)}`,
    drawn: problem.kind === "discard" ? problem.drawn : null,
  };
}

/** メタデータに必要な最小限の公開プロフィール情報（PublicProfile のサブセット）。 */
export interface PublicProfileSummary {
  id: string;
  handle: string | null;
  displayName: string;
  games: readonly unknown[];
}

/** 公開プロフィール（/u/[handle]）の共有メタデータ。プロフィールは常に公開（CLAUDE.md 7-2）。 */
export function buildProfileMetadata(profile: PublicProfileSummary | null): ShareMetadata {
  if (!profile) return siteDefaultMeta();
  const title = profile.handle
    ? `${profile.displayName}（@${profile.handle}）`
    : profile.displayName;
  const description = `${profile.displayName} さんの公開牌譜 ${profile.games.length}件をブラウザで再生できます。`;
  const url = `/u/${profile.handle ?? profile.id}`;
  return shareMeta(title, description, url, { type: "profile", card: "summary" });
}

/** OG 画像カードの文言（タイトル・作者・局数/日付）。カードの全文言をここで一元化し、
 *  画像レンダラ（opengraph-image）はレイアウトだけを担う。 */
export function ogCard(detail: PublicGameSummary | null): {
  title: string;
  author: string | null;
  info: string;
} {
  if (!detail) return { title: "麻雀牌譜", author: null, info: "麻雀の牌譜をブラウザで再生" };
  return { title: titleOf(detail), author: authorOf(detail.owner), info: gameInfo(detail) };
}
