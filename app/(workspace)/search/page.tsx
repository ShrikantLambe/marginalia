"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { SearchResult } from "@/lib/supabase";

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function trunc(text: string | null, n: number): string {
  if (!text) return "";
  return text.length <= n ? text : text.slice(0, n) + "…";
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

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
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-[28px] font-semibold mb-1">
          Marg<span className="text-oxblood">i</span>nalia
        </h1>
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
          Semantic search
        </p>
      </div>

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
