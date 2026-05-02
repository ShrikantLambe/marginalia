import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 5; // concurrent Gemini calls per batch

export async function POST() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items, error } = await supabase
    .from("reading_list")
    .select("id, title, summary, tags")
    .eq("user_id", user.id)
    .is("embedding", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let processed = 0;
  let failed = 0;
  const all = items ?? [];

  // Process in batches of BATCH_SIZE — concurrent within each batch,
  // 100ms gap between batches to respect Gemini free-tier rate limits
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const vector = await embed(buildEmbeddingText(item.title, item.summary, item.tags));
        await supabase
          .from("reading_list")
          .update({
            embedding: `[${vector.join(",")}]`,
            embedding_model: EMBEDDING_MODEL,
            embedded_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("user_id", user.id);
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled") processed++;
      else { failed++; console.error("[backfill-embeddings]", r.reason); }
    }
    if (i + BATCH_SIZE < all.length) await new Promise(r => setTimeout(r, 100));
  }

  return NextResponse.json({ processed, failed });
}
