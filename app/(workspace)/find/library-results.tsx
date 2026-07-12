"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/supabase";

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function trunc(text: string | null, n: number): string {
  if (!text) return "";
  return text.length <= n ? text : text.slice(0, n) + "…";
}

const CHROME = "font-mono text-[10px] tracking-[0.15em] uppercase text-muted";

/**
 * Library mode of the Find page: debounced semantic search over the user's own
 * saved items. When nothing matches, it offers to escalate the same query to a
 * web search through the user's sources.
 */
export function LibraryResults({
  query,
  recentConcepts,
  hasSources,
  onPickConcept,
  onEscalate,
}: {
  query: string;
  recentConcepts: string[];
  hasSources: boolean;
  onPickConcept: (tag: string) => void;
  onEscalate: () => void;
}) {
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); setError(null); setSearching(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true); setError(null);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim() }),
        });
        const json = await res.json();
        if (!res.ok) { setError(json?.error ?? "Search failed"); setResults(null); }
        else setResults(json);
      } catch { setError("Search request failed."); }
      finally { setSearching(false); }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  if (searching) {
    return <div className={`${CHROME} animate-pulse`}>Searching your library…</div>;
  }

  if (error) {
    return <p className="font-serif italic text-oxblood text-[15px]">{error}</p>;
  }

  // Empty input — demonstrate search-by-meaning with the user's own tags
  if (results === null) {
    if (!query && recentConcepts.length > 0) {
      return (
        <div>
          <div className={`${CHROME} mb-3`}>Recent concepts</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {recentConcepts.map((tag) => (
              <button
                key={tag}
                onClick={() => onPickConcept(tag)}
                className="font-serif text-[15px] text-ink/80 hover:text-oxblood transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <p className="font-serif italic text-muted text-[15px]">
        Finds articles in your library by meaning, not just keywords.
      </p>
    );
  }

  // A query returned nothing — offer the web escalation
  if (results.length === 0) {
    return (
      <div>
        <p className="font-serif italic text-muted text-[15px] mb-3">
          Nothing in your library for “{query}”.
        </p>
        {hasSources && (
          <button
            onClick={onEscalate}
            className="font-mono text-[10px] tracking-[0.15em] uppercase border border-oxblood text-oxblood px-3 py-2 hover:bg-oxblood hover:text-paper transition-colors"
          >
            Search the web through your sources →
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={`${CHROME} mb-4`}>
        {results.length} result{results.length !== 1 ? "s" : ""}
      </div>
      <ul className="space-y-px">
        {results.map((item) => (
          <li key={item.id}>
            <Link
              href={`/items/${item.id}`}
              className="block px-4 py-3 border-b border-rule hover:bg-ink/[0.02] transition-colors group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
                  {hostname(item.url)}
                </span>
                <span className="font-mono text-[10px] text-sage">
                  {Math.round(item.similarity * 100)}%
                </span>
              </div>
              <p className="font-serif text-[17px] font-semibold leading-tight group-hover:text-oxblood transition-colors mb-1">
                {item.title || item.url}
              </p>
              {item.summary && (
                <p className="font-serif italic text-[14px] text-muted leading-snug">
                  {trunc(item.summary, 130)}
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
