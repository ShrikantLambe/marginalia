import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** POST { item_ids: string[] } — assign items to project */
export async function POST(req: Request, { params }: Params) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const itemIds: string[] = Array.isArray(body.item_ids) ? body.item_ids : [];
  if (!itemIds.length) return NextResponse.json({ error: "item_ids is required" }, { status: 400 });

  // Verify project belongs to user
  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = itemIds.map(item_id => ({ project_id: projectId, item_id }));
  const { error } = await supabase
    .from("project_items")
    .upsert(rows, { onConflict: "project_id,item_id", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, assigned: itemIds.length });
}

/** DELETE { item_id: string } — remove item from project */
export async function DELETE(req: Request, { params }: Params) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: projectId } = await params;
  const body = await req.json().catch(() => ({}));
  const itemId = typeof body.item_id === "string" ? body.item_id : null;
  if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  // Verify project belongs to user
  const { data: project } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("user_id", user.id).single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("project_items")
    .delete()
    .eq("project_id", projectId)
    .eq("item_id", itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
