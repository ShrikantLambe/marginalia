import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { item_id } = await req.json().catch(() => ({}));
  if (!item_id) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  // Verify brief and item belong to user
  const [{ data: brief }, { data: item }] = await Promise.all([
    supabase.from("briefs").select("id").eq("id", id).eq("user_id", user.id).single(),
    supabase.from("reading_list").select("id").eq("id", item_id).eq("user_id", user.id).single(),
  ]);
  if (!brief || !item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Upsert — if auto-match already exists, upgrade to user-added and un-dismiss
  const { error } = await supabase.from("brief_items").upsert(
    { brief_id: id, item_id, added_by: "user", user_dismissed: false },
    { onConflict: "brief_id,item_id" }
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
