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

  // Verify brief belongs to user
  const { data: brief } = await supabase
    .from("briefs").select("id").eq("id", id).eq("user_id", user.id).single();
  if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await supabase
    .from("brief_items")
    .update({ user_dismissed: true })
    .eq("brief_id", id)
    .eq("item_id", item_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
