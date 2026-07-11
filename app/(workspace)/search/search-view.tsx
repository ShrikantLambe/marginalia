"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function trunc(text: string | null, n: number): string {
  if (!text) return "";
  return text.length <= n ? text : text.slice(0, n) + "…";
}

export function SearchView({ recentConcepts }: { recentConcepts: string[] }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    // Front-page omnibox deep link: /search?q=…
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

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

  return (
    <div className="max-w-3xl px-8 md:px-14 py-10">
      <PageHeader title="Search" caption="Finds articles by meaning, not just keywords." />

      {/* Search input */}
      <div className="relative mb-8">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by concept, theme, or idea…"
          className="w-full bg-transparent border-b-2 border-rule focus:border-oxblood outline-none px-1 py-3 font-serif text-[20px] placeholder:text-muted/50 transition-colors pr-8"
        />
        {searching && (
          <span className="absolute right-1 top-3.5 font-mono text-[10px] text-muted animate-pulse">…</span>
        )}
        {query && !searching && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-1 top-3.5 font-mono text-[11px] text-muted hover:text-ink transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="font-serif italic text-oxblood text-[15px] mb-6">{error}</p>
      )}

      {/* Empty state: demonstrate search-by-meaning with the user's own tags */}
      {results === null && !query && recentConcepts.length > 0 && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-3">
            Recent concepts
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {recentConcepts.map(tag => (
              <button
                key={tag}
                onClick={() => setQuery(tag)}
                className="font-serif text-[15px] text-ink/80 hover:text-oxblood transition-colors"
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results !== null && (
        <>
          {results.length === 0 ? (
            <p className="font-serif italic text-muted text-[16px]">
              Nothing above 50% match. Try rephrasing.
            </p>
          ) : (
            <>
              <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-4">
                {results.length} result{results.length !== 1 ? "s" : ""}
              </p>
              <ul className="space-y-px">
                {results.map(item => (
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
          )}
        </>
      )}

      {/* Empty state */}
      {!query && (
        <p className="font-serif italic text-muted text-[16px]">
          Finds articles by meaning, not just keywords.
        </p>
      )}
    </div>
  );
}
