import { redirect } from "next/navigation";

/** 旧URL。公開牌譜一覧は /kifu へ移動した（URL整理）。 */
export default function ExplorePage() {
  redirect("/kifu");
}
