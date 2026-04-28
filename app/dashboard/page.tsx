import { stackServerApp } from "@/stack";
import { supabase, type ReadingItem } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ReadingList } from "./reading-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { data, error } = await supabase
    .from("reading_list")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) console.error("Failed to load items:", error);

  const items: ReadingItem[] = data ?? [];
  const displayName =
    user.displayName ?? user.primaryEmail?.split("@")[0] ?? "reader";

  return <ReadingList initialItems={items} userName={displayName} />;
}
