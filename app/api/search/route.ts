import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";

const SIMILARITY_THRESHOLD = 0.2;

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const statusFilter: string[] | undefined = Array.isArray(body.status)
    ? body.status
    : undefined;
  const tagFilter: string[] | undefined = Array.isArray(body.tags)
    ? body.tags
    : undefined;
  const limit =
    typeof body.limit === "number" ? Math.min(body.limit, 50) : 20;

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(query);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[POST /api/search] embed failed:", msg);
    return NextResponse.json(
      { error: `Embedding failed: ${msg}` },
      { status: 500 }
    );
  }

  // Fetch more than needed so status/tag filtering still returns enough results
  const { data, error } = await supabase.rpc("match_reading_list", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_user_id: user.id,
    match_threshold: SIMILARITY_THRESHOLD,
    match_count: limit * 4,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let results = (data ?? []) as Array<Record<string, unknown>>;

  if (statusFilter?.length) {
    results = results.filter((r) => statusFilter.includes(r.status as string));
  }
  if (tagFilter?.length) {
    results = results.filter((r) =>
      tagFilter.every((t) => (r.tags as string[])?.includes(t))
    );
  }

  return NextResponse.json(results.slice(0, limit));
}
