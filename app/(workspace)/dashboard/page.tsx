import { stackServerApp } from "@/stack";
import { supabase, type ReadingItem, type ReadingTheme } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ReadingList } from "./reading-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  // Items, themes, and recent highlights in parallel
  const [itemsResult, themesResult, highlightsResult] = await Promise.all([
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
    supabase
      .from("highlights")
      .select("id, text, item_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  if (itemsResult.error) console.error("[dashboard] items error:", itemsResult.error.message);

  const items: ReadingItem[] = itemsResult.data ?? [];
  const themes: ReadingTheme[] = themesResult.data ?? [];

  const recentMargins = (highlightsResult.data ?? []).map(h => ({
    ...h,
    title: items.find(i => i.id === h.item_id)?.title ?? null,
  }));

  const displayName = user.displayName ?? user.primaryEmail?.split("@")[0] ?? "reader";

  return (
    <ReadingList
      initialItems={items}
      initialThemes={themes}
      userName={displayName}
      recentMargins={recentMargins}
    />
  );
}
