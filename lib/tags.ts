import "server-only";
import { supabase } from "./supabase";

/** The user's most frequent tags — powers empty-state suggestions.
 *  Simple frequency query, no LLM call. Failed items excluded. */
export async function topTags(userId: string, n: number): Promise<string[]> {
  const { data } = await supabase
    .from("reading_list")
    .select("tags, status")
    .eq("user_id", userId)
    .neq("status", "failed")
    .not("tags", "is", null)
    .limit(500);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    for (const tag of (row.tags as string[]) ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([tag]) => tag);
}
