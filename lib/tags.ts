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

export type TopicItem = {
  id: string;
  title: string | null;
  url: string;
  site_name: string | null;
  created_at: string;
  last_opened_at: string | null;
};

export type TopicFeed = {
  tag: string;
  count: number;
  items: TopicItem[];
};

/**
 * The user's top topics (most-frequent tags) with their own saved articles in
 * each — for the /home topic rail. One query; the client re-sorts by "latest"
 * (created_at) or "revisited" (last_opened_at). Failed items excluded.
 */
export async function topicFeeds(
  userId: string,
  topicCount: number,
  perTopic: number
): Promise<TopicFeed[]> {
  const { data } = await supabase
    .from("reading_list")
    .select("id, title, url, site_name, tags, created_at, last_opened_at, status")
    .eq("user_id", userId)
    .neq("status", "failed")
    .not("tags", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  const rows = data ?? [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of (row.tags as string[]) ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const topTagsList = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topicCount)
    .map(([tag]) => tag);

  return topTagsList.map((tag) => ({
    tag,
    count: counts.get(tag) ?? 0,
    // rows are already newest-first; take the first `perTopic` tagged with it.
    // last_opened_at travels with each item so the client can re-sort to
    // "recently revisited" without another query.
    items: rows
      .filter((r) => (r.tags as string[])?.includes(tag))
      .slice(0, perTopic)
      .map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        site_name: r.site_name,
        created_at: r.created_at,
        last_opened_at: r.last_opened_at,
      })),
  }));
}
