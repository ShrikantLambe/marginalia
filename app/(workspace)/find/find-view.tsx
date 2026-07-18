"use client";

import { useState, useEffect, useRef } from "react";
import type { Source, Brief } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";
import { LibraryResults } from "./library-results";
import { DiscoverPanel } from "./discover-panel";
import { AskPanel } from "./ask-panel";

type BriefLite = Pick<Brief, "id" | "question" | "status">;
type Mode = "library" | "web" | "ask";

const CHIP = "font-mono text-[10px] tracking-[0.12em] uppercase px-2 py-0.5 border transition-colors";

/**
 * The unified Find surface. One input over two engines: LIBRARY (semantic
 * search of saved items, live/debounced) and WEB (guardrailed Discover through
 * trusted sources, run on submit). Supersedes the separate /search and
 * /discover pages, which now redirect here.
 */
export function FindView({
  sources,
  briefs,
  recentConcepts,
  trySuggestions,
}: {
  sources: Source[];
  briefs: BriefLite[];
  recentConcepts: string[];
  trySuggestions: string[];
}) {
  const [mode, setMode] = useState<Mode>("library");
  const [query, setQuery] = useState("");
  const [runSignal, setRunSignal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore last mode; honor /find?q=…&mode=web&run=1 deep links
  useEffect(() => {
    let initialMode: Mode = "library";
    try {
      const stored = localStorage.getItem("find-mode");
      if (stored === "web" || stored === "ask") initialMode = stored;
    } catch { /* ignore */ }

    const params = new URLSearchParams(window.location.search);
    const mp = params.get("mode");
    if (mp === "web" || mp === "library" || mp === "ask") initialMode = mp;
    setMode(initialMode);

    const qp = params.get("q");
    if (qp) {
      setQuery(qp);
      if (initialMode !== "library" && params.get("run") === "1") setRunSignal((s) => s + 1);
    }
    inputRef.current?.focus();
  }, []);

  // "/" focuses the input from anywhere on the page
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
      if (e.key === "/" && !inField) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function switchMode(next: Mode) {
    setMode(next);
    try { localStorage.setItem("find-mode", next); } catch { /* ignore */ }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Web + Ask cost an API call + quota, so they run only on submit.
    // Library search is live (LibraryResults debounces the query prop).
    if ((mode === "web" || mode === "ask") && query.trim()) setRunSignal((s) => s + 1);
  }

  function escalateToWeb() {
    switchMode("web");
    setRunSignal((s) => s + 1); // query already set
  }

  function rerunAsk(q: string) {
    setQuery(q);
    setRunSignal((s) => s + 1);
  }

  const placeholder =
    mode === "library"
      ? "Search your library by meaning…"
      : mode === "web"
      ? "Search the web — only your sources."
      : "Ask a question about your library…";

  return (
    <div className="max-w-3xl px-8 md:px-14 py-10 pb-24">
      <PageHeader
        title="Find"
        caption="Search your library, or the web through your trusted sources."
      />

      {/* Shared input */}
      <form onSubmit={onSubmit} className="relative mb-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setQuery(""); }}
          placeholder={placeholder}
          className="w-full bg-transparent border-b-2 border-rule focus:border-oxblood outline-none px-1 py-3 font-serif text-[20px] placeholder:text-muted/50 transition-colors pr-8"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-1 top-4 font-mono text-[11px] text-muted hover:text-ink transition-colors"
          >
            ✕
          </button>
        )}
      </form>

      {/* Mode toggle */}
      <div className="flex justify-end gap-2 mb-8">
        <button
          onClick={() => switchMode("library")}
          className={`${CHIP} ${mode === "library" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
        >
          My Library
        </button>
        <button
          onClick={() => switchMode("web")}
          className={`${CHIP} ${mode === "web" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
        >
          Web
        </button>
        <button
          onClick={() => switchMode("ask")}
          className={`${CHIP} ${mode === "ask" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
        >
          Ask
        </button>
      </div>

      {mode === "library" ? (
        <LibraryResults
          query={query}
          recentConcepts={recentConcepts}
          hasSources={sources.length > 0}
          onPickConcept={setQuery}
          onEscalate={escalateToWeb}
        />
      ) : mode === "web" ? (
        <DiscoverPanel
          initialSources={sources}
          briefs={briefs}
          trySuggestions={trySuggestions}
          query={query}
          setQuery={setQuery}
          runSignal={runSignal}
        />
      ) : (
        <AskPanel query={query} runSignal={runSignal} onRerun={rerunAsk} />
      )}
    </div>
  );
}
