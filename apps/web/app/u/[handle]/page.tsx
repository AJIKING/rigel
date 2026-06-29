"use client";

import { useParams } from "next/navigation";
import { UserPageShell } from "../../../components/account/UserPageShell";

export default function UserPage() {
  const { handle } = useParams<{ handle: string }>();
  return <UserPageShell idOrHandle={handle} />;
}
