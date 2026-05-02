import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemIds: string[] = Array.isArray(body.item_ids) ? body.item_ids : [];
  const angle: string | null = typeof body.angle === "string" && body.angle.trim() ? body.angle.trim() : null;

  if (itemIds.length < 2) return NextResponse.json({ error: "Select at least 2 articles" }, { status: 400 });
  if (itemIds.length > 8) return NextResponse.json({ error: "Maximum 8 articles per synthesis" }, { status: 400 });

  // Verify items belong to this user
  const { data: items } = await supabase
    .from("reading_list")
    .select("id")
    .eq("user_id", user.id)
    .in("id", itemIds);

  if (!items || items.length !== itemIds.length) {
    return NextResponse.json({ error: "One or more articles not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("syntheses")
    .insert({ user_id: user.id, source_item_ids: itemIds, prompt: angle, draft: "" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
