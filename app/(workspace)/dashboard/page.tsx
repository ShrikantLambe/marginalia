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

  // Fetch all items, projects, project assignments, and themes in parallel
  const [itemsResult, themesResult, projectsResult, assignmentsResult] = await Promise.all([
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
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "paused"])
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("project_items")
      .select("item_id, project_id"),
  ]);

  if (itemsResult.error) console.error("[dashboard] items error:", itemsResult.error.message);

  const allItems: ReadingItem[] = itemsResult.data ?? [];
  const themes: ReadingTheme[] = themesResult.data ?? [];
  const projects: Project[] = projectsResult.data ?? [];
  const assignments = assignmentsResult.data ?? [];

  // Filter items in JavaScript — avoids complex Supabase PostgREST filters
  let items: ReadingItem[];
  if (projectId) {
    const inProject = new Set(
      assignments.filter(a => a.project_id === projectId).map(a => a.item_id)
    );
    items = allItems.filter(i => inProject.has(i.id));
  } else {
    // Inbox: items not assigned to any project
    const assignedAnywhere = new Set(assignments.map(a => a.item_id));
    items = allItems.filter(i => !assignedAnywhere.has(i.id));
  }

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
