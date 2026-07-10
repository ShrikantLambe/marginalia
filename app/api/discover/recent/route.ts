import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** Clear the user's recent-search history (the Discover empty-state list). */
export async function DELETE(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("discover_searches")
    .delete()
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
