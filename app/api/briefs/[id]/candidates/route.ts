import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { parseEmbedding, cosineSimilarity } from "@/lib/embeddings";

export const runtime = "nodejs";

const CANDIDATE_THRESHOLD = 0.4; // lower than auto-route — for discovery

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Get brief embedding
  const { data: brief } = await supabase
    .from("briefs")
    .select("id, embedding")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const bvec = parseEmbedding(brief.embedding);
  if (!bvec) return NextResponse.json([]); // no embedding yet

  // Get already-attached item IDs (including dismissed — don't resurface them)
  const { data: attached } = await supabase
    .from("brief_items")
    .select("item_id")
    .eq("brief_id", id);

  const attachedSet = new Set((attached ?? []).map(r => r.item_id));

  // Fetch all embedded items for this user not already in brief
  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, summary, url, tags, created_at, status, embedding")
    .eq("user_id", user.id)
    .not("embedding", "is", null);

  if (!items?.length) return NextResponse.json([]);

  const candidates = items
    .filter(i => !attachedSet.has(i.id))
    .map(i => {
      const ivec = parseEmbedding(i.embedding);
      return ivec ? { ...i, similarity: cosineSimilarity(bvec, ivec) } : null;
    })
    .filter((i): i is NonNullable<typeof i> => i !== null && i.similarity >= CANDIDATE_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 12)
    .map(({ embedding: _e, ...rest }) => rest); // drop raw embedding from response

  return NextResponse.json(candidates);
}
