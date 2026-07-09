import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Returns every thread (general + all passage threads) for the item —
  // the client groups by highlight_id to build the thread switcher and
  // per-thread message lists without an extra round trip per thread.
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
