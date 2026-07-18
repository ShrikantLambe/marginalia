import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Recent questions, for the Ask empty-state history. */
export async function GET(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("library_answers")
    .select("id, question, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  return NextResponse.json(data ?? []);
}

/**
 * Retrieval step: embed the question, find the most relevant saved items, and
 * create the answer row. Returns the source cards immediately; the answer
 * streams from /api/ask/[id]/stream.
 */
export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`ask:${user.id}`, 20)) {
    return NextResponse.json({ error: "Too many questions. Wait a moment." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embed(question);
  } catch {
    return NextResponse.json({ error: "Couldn't process the question. Try again." }, { status: 502 });
  }

  // Lower threshold than /api/search (0.5) — favor recall for question answering
  const { data: matches } = await supabase.rpc("match_reading_list", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_user_id: user.id,
    match_threshold: 0.35,
    match_count: 8,
  });

  const sources = ((matches ?? []) as Array<Record<string, unknown>>)
    .filter((m) => m.status !== "failed")
    .slice(0, 6)
    .map((m) => ({ id: m.id as string, title: (m.title as string | null) ?? null, site_name: (m.site_name as string | null) ?? null }));

  const { data: answer, error } = await supabase
    .from("library_answers")
    .insert({ user_id: user.id, question, source_item_ids: sources.map((s) => s.id) })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: answer.id, sources });
}
