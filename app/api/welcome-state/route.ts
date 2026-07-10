import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase, type DiscoverResult } from "@/lib/supabase";
import { computeWelcomeState } from "@/lib/welcome";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [itemsRes, synthesesRes, searchesRes, unreadRes] = await Promise.all([
    supabase
      .from("reading_list")
      .select("id, title, status, scroll_progress, last_opened_at")
      .eq("user_id", user.id)
      .not("last_opened_at", "is", null)
      .gte("last_opened_at", fourteenDaysAgo)
      .order("last_opened_at", { ascending: false })
      .limit(50),
    supabase
      .from("syntheses")
      .select("id, title, created_at")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("discover_searches")
      .select("id, query, scope, cache_key, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("reading_list")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "queued"),
  ]);

  // resume_search suppression: did the user capture anything from the latest
  // search's cached results after running it?
  let capturedFromLastSearch = false;
  const latestSearch = searchesRes.data?.[0];
  if (latestSearch?.cache_key) {
    const { data: cacheRow } = await supabase
      .from("discover_cache")
      .select("results")
      .eq("user_id", user.id)
      .eq("cache_key", latestSearch.cache_key)
      .maybeSingle();
    const cachedUrls = ((cacheRow?.results ?? []) as DiscoverResult[]).map((r) => r.url);
    if (cachedUrls.length) {
      const { count } = await supabase
        .from("reading_list")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("url", cachedUrls)
        .gt("created_at", latestSearch.created_at);
      capturedFromLastSearch = (count ?? 0) > 0;
    }
  }

  const state = computeWelcomeState({
    now: new Date(),
    items: itemsRes.data ?? [],
    syntheses: synthesesRes.data ?? [],
    searches: searchesRes.data ?? [],
    capturedFromLastSearch,
    unreadCount: unreadRes.count ?? 0,
  });

  return NextResponse.json(state);
}
