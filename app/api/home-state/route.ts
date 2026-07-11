import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { computeHomeState } from "@/lib/home";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [itemsRes, queuedRes, draftsRes, sourcesRes] = await Promise.all([
    supabase
      .from("reading_list")
      .select("id, title, site_name, url, summary, status, scroll_progress, reading_time_minutes, last_opened_at")
      .eq("user_id", user.id)
      .neq("status", "failed")
      .not("last_opened_at", "is", null)
      .gte("last_opened_at", fourteenDaysAgo)
      .order("last_opened_at", { ascending: false })
      .limit(50),
    supabase
      .from("reading_list")
      .select("reading_time_minutes")
      .eq("user_id", user.id)
      .eq("status", "queued"),
    supabase
      .from("syntheses")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("sources")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const state = computeHomeState({
    now: new Date(),
    items: itemsRes.data ?? [],
    queued: queuedRes.data ?? [],
    drafts: draftsRes.data ?? [],
    sourceCount: sourcesRes.count ?? 0,
  });

  return NextResponse.json(state);
}
