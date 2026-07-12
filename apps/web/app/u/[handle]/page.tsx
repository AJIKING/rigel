import { cache } from "react";
import { UserPageShell } from "../../../components/account/UserPageShell";
import { getPublicProfile } from "../../../lib/api-server";
import { buildProfileMetadata } from "../../../lib/og-meta";

// generateMetadata 用の公開プロフィール取得（プロフィールは常に公開・認証不要）。
const getProfile = cache((idOrHandle: string) => getPublicProfile(idOrHandle).catch(() => null));

// 動的メタデータ: タブ名は「表示名（@handle）」。不存在は既定へフォールバック。
export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return buildProfileMetadata(await getProfile(handle));
}

export default async function UserPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  return <UserPageShell idOrHandle={handle} />;
}
