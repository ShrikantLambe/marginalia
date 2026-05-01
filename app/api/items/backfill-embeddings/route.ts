import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: items, error } = await supabase
    .from("reading_list")
    .select("id, title, summary, tags")
    .eq("user_id", user.id)
    .is("embedding", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let failed = 0;

  for (const item of items ?? []) {
    try {
      const vector = await embed(
        buildEmbeddingText(item.title, item.summary, item.tags)
      );
      await supabase
        .from("reading_list")
        .update({
          embedding: `[${vector.join(",")}]`,
          embedding_model: EMBEDDING_MODEL,
          embedded_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("user_id", user.id);
      processed++;
      // Stay under Gemini free-tier rate limits
      await new Promise((r) => setTimeout(r, 100));
    } catch (e) {
      console.error(`[backfill] failed for item ${item.id}:`, e);
      failed++;
    }
  }

  return NextResponse.json({ processed, failed });
}
