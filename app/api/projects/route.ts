import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .in("status", ["active", "paused"])
    .order("sort_order")
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!projects?.length) return NextResponse.json([]);

  // Attach item counts
  const { data: counts } = await supabase
    .from("project_items")
    .select("project_id")
    .in("project_id", projects.map(p => p.id));

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.project_id] = (countMap[row.project_id] ?? 0) + 1;
  }

  return NextResponse.json(projects.map(p => ({ ...p, item_count: countMap[p.id] ?? 0 })));
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const emoji = typeof body.emoji === "string" ? body.emoji.trim() || "📁" : "📁";
  const description = typeof body.description === "string" ? body.description.trim() || null : null;

  // Place new project last in sort order
  const { count } = await supabase
    .from("projects")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data, error } = await supabase
    .from("projects")
    .insert({ user_id: user.id, name, emoji, description, sort_order: count ?? 0 })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, item_count: 0 });
}
