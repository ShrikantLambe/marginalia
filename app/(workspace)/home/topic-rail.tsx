"use client";

import { useState } from "react";
import Link from "next/link";
import type { TopicFeed, TopicItem } from "@/lib/tags";

type Sort = "latest" | "revisited";

const MONO = "font-mono tracking-[0.15em] uppercase";

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function sortItems(items: TopicItem[], sort: Sort): TopicItem[] {
  if (sort === "latest") return items; // already newest-first from the server
  // "revisited" — most recently opened first; never-opened sink to the bottom
  return [...items].sort((a, b) => {
    const ta = a.last_opened_at ? new Date(a.last_opened_at).getTime() : 0;
    const tb = b.last_opened_at ? new Date(b.last_opened_at).getTime() : 0;
    return tb - ta;
  });
}

/**
 * The /home right rail: the reader's top topics (their most-used tags) with
 * their own saved articles in each. "Latest" (newest saved) / "Revisited"
 * (most recently opened) toggle, and a per-topic link that runs a Discover
 * web search for that topic on demand — no automatic search cost.
 */
export function TopicRail({ topics }: { topics: TopicFeed[] }) {
  const [sort, setSort] = useState<Sort>("latest");

  if (topics.length === 0) {
    return (
      <p className="font-serif italic text-[13px] text-muted">
        Topics appear here as you save and tag articles.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <span className={`${MONO} text-[10px] text-muted`}>Your topics</span>
        <div className={`${MONO} text-[9px] flex items-center gap-2`}>
          <button
            onClick={() => setSort("latest")}
            className={sort === "latest" ? "text-oxblood" : "text-muted hover:text-ink transition-colors"}
          >
            Latest
          </button>
          <span className="text-rule">·</span>
          <button
            onClick={() => setSort("revisited")}
            className={sort === "revisited" ? "text-oxblood" : "text-muted hover:text-ink transition-colors"}
          >
            Revisited
          </button>
        </div>
      </div>

      <ul className="space-y-6">
        {topics.map((topic) => (
          <li key={topic.tag}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <span className={`${MONO} text-[10px] text-sage`}>
                {topic.tag} <span className="text-muted">· {topic.count}</span>
              </span>
              <Link
                href={`/find?mode=web&q=${encodeURIComponent(topic.tag)}&run=1`}
                className={`${MONO} text-[8px] text-muted hover:text-oxblood transition-colors flex-shrink-0`}
                title="Find more on the web through your sources"
              >
                web →
              </Link>
            </div>
            <ul className="space-y-2">
              {sortItems(topic.items, sort).map((item) => (
                <li key={item.id}>
                  <Link href={`/items/${item.id}`} className="group block">
                    <p className="font-serif text-[13px] leading-snug text-ink/85 group-hover:text-oxblood transition-colors">
                      {item.title || item.url}
                    </p>
                    <span className={`${MONO} text-[8px] text-muted`}>
                      {item.site_name || hostname(item.url)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
