import "server-only";
import { supabase } from "@/lib/supabase";
import { parseEmbedding, cosineSimilarity } from "@/lib/embeddings";

const AUTO_THRESHOLD = 0.55;

/** After an item is embedded, find open briefs it matches and insert auto-links. Never throws. */
export async function autoRouteToBriefs(
  userId: string,
  itemId: string,
  embedding: number[]
): Promise<void> {
  try {
    const { data: briefs } = await supabase
      .from("briefs")
      .select("id, embedding")
      .eq("user_id", userId)
      .eq("status", "open")
      .not("embedding", "is", null);

    if (!briefs?.length) return;

    const toInsert: { brief_id: string; item_id: string; added_by: "auto"; similarity: number }[] = [];

    for (const brief of briefs) {
      const bvec = parseEmbedding(brief.embedding);
      if (!bvec) continue;
      const sim = cosineSimilarity(embedding, bvec);
      if (sim >= AUTO_THRESHOLD) {
        toInsert.push({ brief_id: brief.id, item_id: itemId, added_by: "auto", similarity: sim });
      }
    }

    if (!toInsert.length) return;

    await supabase.from("brief_items").upsert(toInsert, {
      onConflict: "brief_id,item_id",
      ignoreDuplicates: true, // leaves dismissed rows untouched
    });
  } catch (e) {
    console.error("[autoRouteToBriefs] failed:", e);
  }
}

/** When a brief is created/re-embedded, scan all existing items for auto-matches. */
export async function autoMatchItemsToBrief(
  userId: string,
  briefId: string,
  briefEmbedding: number[]
): Promise<number> {
  try {
    const { data: items } = await supabase
      .from("reading_list")
      .select("id, embedding")
      .eq("user_id", userId)
      .not("embedding", "is", null);

    if (!items?.length) return 0;

    const toInsert: { brief_id: string; item_id: string; added_by: "auto"; similarity: number }[] = [];

    for (const item of items) {
      const ivec = parseEmbedding(item.embedding);
      if (!ivec) continue;
      const sim = cosineSimilarity(briefEmbedding, ivec);
      if (sim >= AUTO_THRESHOLD) {
        toInsert.push({ brief_id: briefId, item_id: item.id, added_by: "auto", similarity: sim });
      }
    }

    if (!toInsert.length) return 0;

    await supabase.from("brief_items").upsert(toInsert, {
      onConflict: "brief_id,item_id",
      ignoreDuplicates: true,
    });

    return toInsert.length;
  } catch (e) {
    console.error("[autoMatchItemsToBrief] failed:", e);
    return 0;
  }
}
