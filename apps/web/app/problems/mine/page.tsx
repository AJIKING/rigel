import { redirect } from "next/navigation";

/** 旧URL。マイ何切るはマイページのタブ /mypage/problems へ移動した（URL整理）。 */
export default function OldMyProblemsPage() {
  redirect("/mypage/problems");
}
