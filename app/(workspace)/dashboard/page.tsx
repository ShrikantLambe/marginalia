import { stackServerApp } from "@/stack";
import { supabase, type ReadingItem, type ReadingTheme } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ReadingList } from "./reading-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const [itemsResult, themesResult] = await Promise.all([
    supabase
      .from("reading_list")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reading_themes")
      .select("*")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false }),
  ]);

  if (itemsResult.error) console.error("Failed to load items:", itemsResult.error);

  const items: ReadingItem[] = itemsResult.data ?? [];
  const themes: ReadingTheme[] = themesResult.data ?? [];
  const displayName =
    user.displayName ?? user.primaryEmail?.split("@")[0] ?? "reader";

  return <ReadingList initialItems={items} initialThemes={themes} userName={displayName} />;
}
