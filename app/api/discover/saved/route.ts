import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const MAX_SAVED = 20;

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : query;
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });

  const { count } = await supabase
    .from("discover_saved_searches")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_SAVED) {
    return NextResponse.json({ error: `Saved-search limit of ${MAX_SAVED} reached.` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("discover_saved_searches")
    .insert({ user_id: user.id, name, query, scope: body.scope?.mode ? body.scope : { mode: "all" } })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
