import { stackServerApp } from "@/stack";
import { supabase, type ReadingItem, type ReadingTheme, type Project } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { ReadingList } from "./reading-list";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const params = await searchParams;
  const projectId = params.project ?? null;

  // Build items query — Inbox (no project) or a specific project
  let itemsQuery = supabase
    .from("reading_list")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (projectId) {
    // Items in this project
    const { data: projectItemIds } = await supabase
      .from("project_items")
      .select("item_id")
      .eq("project_id", projectId);
    const ids = (projectItemIds ?? []).map(r => r.item_id);
    itemsQuery = ids.length
      ? itemsQuery.in("id", ids)
      : itemsQuery.in("id", ["00000000-0000-0000-0000-000000000000"]); // empty result
  } else {
    // Inbox: items NOT in any project
    const { data: assignedItemIds } = await supabase
      .from("project_items")
      .select("item_id");
    const assignedIds = (assignedItemIds ?? []).map(r => r.item_id);
    if (assignedIds.length) {
      itemsQuery = itemsQuery.not("id", "in", `(${assignedIds.join(",")})`);
    }
  }

  const [itemsResult, themesResult, projectsResult] = await Promise.all([
    itemsQuery,
    supabase
      .from("reading_themes")
      .select("*")
      .eq("user_id", user.id)
      .order("generated_at", { ascending: false }),
    supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .order("sort_order")
      .order("created_at"),
  ]);

  if (itemsResult.error) console.error("Failed to load items:", itemsResult.error);

  const items: ReadingItem[] = itemsResult.data ?? [];
  const themes: ReadingTheme[] = themesResult.data ?? [];
  const projects: Project[] = projectsResult.data ?? [];
  const displayName = user.displayName ?? user.primaryEmail?.split("@")[0] ?? "reader";

  const activeProject = projectId ? projects.find(p => p.id === projectId) : null;
  const projectName = activeProject ? `${activeProject.emoji} ${activeProject.name}` : undefined;

  return (
    <ReadingList
      initialItems={items}
      initialThemes={themes}
      userName={displayName}
      projectId={projectId ?? undefined}
      projects={projects}
      projectName={projectName}
    />
  );
}
