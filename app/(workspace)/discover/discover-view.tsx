"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import type { Source, Brief, DiscoverResult, DiscoverScope, DiscoverSavedSearch } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

type BriefLite = Pick<Brief, "id" | "question" | "status">;
type RecentSearch = { id: string; query: string; scope: DiscoverScope; created_at: string };
type Meta = { cached: boolean; requested: number; dropped: number; allowlistSize: number };
type CaptureState = "idle" | "capturing" | "captured" | "duplicate";

const CHROME = "font-mono text-[10px] tracking-[0.15em] uppercase text-muted";
const CHIP = "font-mono text-[10px] tracking-[0.12em] uppercase px-2 py-1 border transition-colors";

export function DiscoverView({
  initialSources,
  briefs,
  trySuggestions = [],
}: {
  initialSources: Source[];
  briefs: BriefLite[];
  trySuggestions?: string[];
}) {
  const [sources] = useState<Source[]>(initialSources);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<DiscoverScope>({ mode: "all" });
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [showAllowlist, setShowAllowlist] = useState(false);
  const [results, setResults] = useState<DiscoverResult[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [captureStates, setCaptureStates] = useState<Record<string, { state: CaptureState; itemId?: string }>>({});
  const [saved, setSaved] = useState<DiscoverSavedSearch[]>([]);
  const [recent, setRecent] = useState<RecentSearch[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Restore last-used scope; load saved + recent searches; honor ?q= deep links
  useEffect(() => {
    let initialScope: DiscoverScope = { mode: "all" };
    try {
      const stored = localStorage.getItem("discover-scope");
      if (stored) { initialScope = JSON.parse(stored); setScope(initialScope); }
    } catch { /* ignore */ }
    fetch("/api/discover")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setSaved(data.saved ?? []);
        setRecent(data.recent ?? []);
      })
      .catch(() => {});
    // Welcome Back "re-run search" deep link: /discover?q=…&run=1
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setQuery(q);
      if (params.get("run") === "1") void runSearch(q, initialScope);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "/" focuses the input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const briefsWithSources = briefs.filter((b) => sources.some((s) => s.brief_id === b.id));

  // Scoped sources → allowlist preview (mirrors server logic for the indicator)
  const scopedSources =
    scope.mode === "brief" ? sources.filter((s) => s.brief_id === scope.briefId)
    : scope.mode === "custom" ? sources.filter((s) => customIds.includes(s.id))
    : sources;
  const scopedDomains = [...new Set([
    ...scopedSources.filter((s) => s.type === "domain").map((s) => s.value),
    ...scopedSources.filter((s) => s.type === "author").flatMap((s) => s.home_domains ?? []),
  ])];
  const authorCount = scopedSources.filter((s) => s.type === "author").length;

  function applyScope(next: DiscoverScope) {
    setScope(next);
    try { localStorage.setItem("discover-scope", JSON.stringify(next)); } catch { /* ignore */ }
  }

  const runSearch = useCallback(async (q: string, sc: DiscoverScope) => {
    if (!q.trim()) return;
    setSearching(true);
    setError(null);
    setResults(null);
    setMeta(null);
    try {
      const effectiveScope = sc.mode === "custom" ? { ...sc, sourceIds: customIds } : sc;
      const res = await fetch("/api/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q.trim(), scope: effectiveScope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({ status: res.status, message: data.error ?? "Search failed" });
        return;
      }
      setResults(data.results);
      setMeta(data.meta);
      if (!data.meta.cached) {
        setRecent((prev) => [{ id: `local-${Date.now()}`, query: q.trim(), scope: sc, created_at: new Date().toISOString() }, ...prev].slice(0, 8));
      }
    } catch {
      setError({ status: 0, message: "Network error" });
    } finally {
      setSearching(false);
    }
  }, [customIds]);

  async function capture(result: DiscoverResult) {
    setCaptureStates((prev) => ({ ...prev, [result.url]: { state: "capturing" } }));
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: result.url }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409 && data.item?.id) {
      setCaptureStates((prev) => ({ ...prev, [result.url]: { state: "duplicate", itemId: data.item.id } }));
      return;
    }
    if (!res.ok) {
      setCaptureStates((prev) => ({ ...prev, [result.url]: { state: "idle" } }));
      setError({ status: res.status, message: data.error ?? "Capture failed" });
      return;
    }
    setCaptureStates((prev) => ({ ...prev, [result.url]: { state: "captured", itemId: data.id } }));
    // Brief-scoped capture always lands in the scoped brief, even if the
    // auto-router's cosine threshold missed it
    if (scope.mode === "brief" && scope.briefId) {
      void fetch(`/api/briefs/${scope.briefId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: data.id }),
      });
    }
  }

  async function saveSearch() {
    if (!query.trim()) return;
    const res = await fetch("/api/discover/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: query.trim(), scope }),
    });
    if (res.ok) {
      const created = await res.json();
      setSaved((prev) => [created, ...prev]);
    }
  }

  async function renameSaved(id: string) {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name) return;
    const res = await fetch(`/api/discover/saved/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSaved((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
  }

  async function deleteSaved(id: string) {
    setSaved((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/discover/saved/${id}`, { method: "DELETE" });
  }

  function rerun(q: string, sc: DiscoverScope) {
    setQuery(q);
    applyScope(sc);
    void runSearch(q, sc);
  }

  const zeroSources = sources.length === 0;

  return (
    <main className="max-w-3xl px-8 md:px-14 py-10 pb-24">
      <PageHeader title="Discover" caption="The web, through your sources — your library lives in Search." />

      {zeroSources ? (
        <div className="border border-rule p-6">
          <p className="font-serif text-[15px] mb-2">Discover only searches sites and writers you trust.</p>
          <p className="font-serif italic text-[13px] text-muted mb-4">
            Add your first sources — there are one-click suggestions from your library waiting.
          </p>
          <Link href="/sources" className="font-mono text-[10px] tracking-[0.15em] uppercase border border-oxblood text-oxblood px-3 py-2 hover:bg-oxblood hover:text-paper transition-colors">
            Set up sources
          </Link>
        </div>
      ) : (
        <>
          {/* Saved searches */}
          {saved.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {saved.map((s) => (
                <span key={s.id} className="group/saved inline-flex items-center gap-1">
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") renameSaved(s.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      onBlur={() => renameSaved(s.id)}
                      className="bg-transparent border-b border-oxblood outline-none font-mono text-[10px] uppercase w-28"
                    />
                  ) : (
                    <button onClick={() => rerun(s.query, s.scope)} className={`${CHIP} border-rule text-muted hover:border-oxblood hover:text-oxblood`}>
                      {s.name}
                    </button>
                  )}
                  <button
                    onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}
                    className="opacity-0 group-hover/saved:opacity-100 text-muted hover:text-ink text-[10px] transition-opacity"
                    title="Rename"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteSaved(s.id)}
                    className="opacity-0 group-hover/saved:opacity-100 text-muted hover:text-oxblood text-[10px] transition-opacity"
                    title="Delete"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search input */}
          <form
            onSubmit={(e) => { e.preventDefault(); void runSearch(query, scope); }}
            className="flex items-center gap-3 mb-3"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setResults(null); setError(null); } }}
              placeholder="Search the web — only your sources."
              className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none py-2 font-serif italic text-[16px] placeholder:text-muted/50 transition-colors"
            />
            {query.trim() && (
              <button type="button" onClick={saveSearch} className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors flex-shrink-0">
                Save
              </button>
            )}
          </form>

          {/* Scope chips */}
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => { applyScope({ mode: "all" }); setShowCustom(false); }}
              className={`${CHIP} ${scope.mode === "all" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
            >
              All sources
            </button>
            {briefsWithSources.map((b) => (
              <button
                key={b.id}
                onClick={() => { applyScope({ mode: "brief", briefId: b.id }); setShowCustom(false); }}
                className={`${CHIP} ${scope.mode === "brief" && scope.briefId === b.id ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
              >
                {b.question.slice(0, 32)}
              </button>
            ))}
            <button
              onClick={() => { setShowCustom((v) => !v); applyScope({ mode: "custom", sourceIds: customIds }); }}
              className={`${CHIP} ${scope.mode === "custom" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
            >
              Custom…
            </button>
          </div>

          {showCustom && scope.mode === "custom" && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 pl-1">
              {sources.map((s) => (
                <label key={s.id} className="flex items-center gap-1.5 font-serif text-[13px] text-ink/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customIds.includes(s.id)}
                    onChange={(e) =>
                      setCustomIds((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                    }
                    className="accent-[#7a1f1f]"
                  />
                  {s.type === "author" ? <em>{s.value}</em> : s.value}
                </label>
              ))}
            </div>
          )}

          {/* Allowlist indicator — the guardrail, always visible */}
          <button onClick={() => setShowAllowlist((v) => !v)} className={`${CHROME} hover:text-ink transition-colors mb-6 block`}>
            Searching {scopedDomains.length} {scopedDomains.length === 1 ? "site" : "sites"}
            {authorCount > 0 && ` · ${authorCount} ${authorCount === 1 ? "author" : "authors"}`}
            {" "}{showAllowlist ? "▴" : "▾"}
          </button>
          {showAllowlist && (
            <p className="font-mono text-[11px] text-muted -mt-4 mb-6 leading-relaxed">
              {scopedDomains.join(" · ") || "—"}
            </p>
          )}

          {/* Empty state: the product introducing itself — saved, recent, try */}
          {!results && !searching && !error && !query && (
            <div className="space-y-8">
              {recent.length > 0 && (
                <div>
                  <div className={`${CHROME} mb-2 flex items-center gap-3`}>
                    <span>Recent</span>
                    <button
                      onClick={async () => {
                        setRecent([]);
                        await fetch("/api/discover/recent", { method: "DELETE" }).catch(() => {});
                      }}
                      className="text-muted/60 hover:text-oxblood transition-colors normal-case tracking-normal"
                    >
                      clear all
                    </button>
                  </div>
                  <ul className="space-y-1">
                    {recent.slice(0, 5).map((r) => (
                      <li key={r.id}>
                        <button onClick={() => rerun(r.query, r.scope)} className="font-serif text-[14px] text-ink/80 hover:text-oxblood transition-colors">
                          {r.query}
                          <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted ml-2">
                            {r.scope?.mode === "brief" ? "brief" : r.scope?.mode === "custom" ? "custom" : "all sources"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {trySuggestions.length > 0 && (
                <div>
                  <div className={`${CHROME} mb-2`}>Try</div>
                  <p className="font-serif text-[14px] text-ink/80">
                    {trySuggestions.map((tag, i) => (
                      <span key={tag}>
                        {i > 0 && <span className="text-muted"> · </span>}
                        <button
                          onClick={() => { applyScope({ mode: "all" }); rerun(tag, { mode: "all" }); }}
                          className="hover:text-oxblood transition-colors"
                        >
                          “{tag}”
                        </button>
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* States */}
          {searching && (
            <div className={`${CHROME} animate-pulse`}>Searching your sources…</div>
          )}

          {error && (
            <div className="border border-rule p-4">
              <p className="font-serif text-[14px] text-ink mb-1">
                {error.status === 429 ? "Easy does it — that's the rate limit." : error.message}
              </p>
              {error.status === 400 && error.message.includes("sources") && (
                <Link href="/sources" className="font-mono text-[10px] tracking-[0.12em] uppercase text-oxblood hover:underline">
                  Add sources →
                </Link>
              )}
            </div>
          )}

          {results && meta && (
            <>
              <div className={`${CHROME} mb-4`}>
                {results.length} {results.length === 1 ? "result" : "results"}
                {meta.cached && " · cached"}
                {meta.dropped > 0 && ` · ${meta.dropped} dropped by guardrail`}
              </div>
              {results.length === 0 && (
                <p className="font-serif italic text-[14px] text-muted">
                  Nothing from your sources for this query. Broaden the scope, or add sources.
                </p>
              )}
              <ul className="space-y-6">
                {results.map((r) => {
                  const cap = captureStates[r.url]?.state ?? "idle";
                  const capturedId = captureStates[r.url]?.itemId ?? r.itemId;
                  const inLibrary = r.alreadyCaptured || cap === "captured" || cap === "duplicate";
                  return (
                    <li key={r.url} className="border-b border-rule/60 pb-5">
                      <div className="flex items-baseline justify-between gap-4">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="font-serif text-[17px] font-semibold leading-snug hover:text-oxblood transition-colors">
                          {r.title || r.url}
                        </a>
                        {inLibrary ? (
                          <Link href={`/items/${capturedId}`} className="font-mono text-[10px] tracking-[0.12em] uppercase text-sage flex-shrink-0 hover:underline">
                            In your library →
                          </Link>
                        ) : (
                          <button
                            onClick={() => capture(r)}
                            disabled={cap === "capturing"}
                            className="font-mono text-[10px] tracking-[0.12em] uppercase border border-oxblood text-oxblood px-2 py-1 hover:bg-oxblood hover:text-paper transition-colors disabled:opacity-40 flex-shrink-0"
                          >
                            {cap === "capturing" ? "Capturing…" : "Capture"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-muted mt-1 mb-1.5">
                        <span>{hostnameOf(r.url)}</span>
                        {r.publishedDate && <span>{r.publishedDate}</span>}
                        {r.authorVerification === "verified" && r.matchedAuthor && (
                          <span className="text-sage" title="Byline verified against your author list">✓ {r.matchedAuthor}</span>
                        )}
                      </div>
                      <p className={`font-serif text-[14px] leading-relaxed ${r.authorVerification === "unverified" ? "text-muted" : "text-ink/80"}`}>
                        {r.snippet}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </main>
  );
}

function hostnameOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}
