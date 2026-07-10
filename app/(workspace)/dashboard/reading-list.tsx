"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReadingItem, ArticleHighlight, SearchResult, ReadingTheme, Project } from "@/lib/supabase";
import { WelcomePanel } from "./welcome-panel";

type Status = "queued" | "reading" | "read" | "archived";
type Tab = "queued" | "reading" | "read" | "archived" | "all";

const STATUS_CYCLE: Status[] = ["queued", "reading", "read", "archived"];
const STATUS_LABELS: Record<Status, string> = { queued: "Queued", reading: "Reading", read: "Read", archived: "Archived" };

function nextStatus(s: Status): Status {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function trunc(text: string | null, n: number): string {
  if (!text) return "";
  return text.length <= n ? text : text.slice(0, n) + "…";
}

// ── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
          onClick={() => onChange(value === n ? null : n)}
          className={`text-sm leading-none transition-colors ${(hover ?? value ?? 0) >= n ? "text-oxblood" : "text-rule"}`}>
          ★
        </button>
      ))}
    </div>
  );
}

// ── Dense list item ──────────────────────────────────────────────────────────

function ListItem({
  item, selected, selectMode, inSelectedSet,
  onSelect, onToggleSelect, onCycleStatus,
}: {
  item: ReadingItem; selected: boolean; selectMode: boolean; inSelectedSet: boolean;
  onSelect: () => void; onToggleSelect: () => void; onCycleStatus: (e: React.MouseEvent) => void;
}) {
  const status = (item.status ?? "queued") as Status;
  return (
    <li
      onClick={selectMode ? onToggleSelect : onSelect}
      className={`relative px-4 py-3 cursor-pointer border-b border-rule transition-colors hover:bg-ink/[0.02] ${selected ? "bg-ink/[0.03]" : ""}`}
    >
      {/* Selected bar */}
      {selected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-oxblood" />}
      {/* Select mode checkbox */}
      {selectMode && (
        <span className={`absolute right-4 top-3 w-4 h-4 border flex items-center justify-center ${inSelectedSet ? "bg-oxblood border-oxblood" : "border-rule"}`}>
          {inSelectedSet && <span className="text-paper text-[9px] leading-none">✓</span>}
        </span>
      )}
      {/* Line 1: metadata */}
      <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted flex items-center gap-1.5 mb-1">
        <span>{hostname(item.url)}</span>
        <span>·</span>
        <span>{formatDate(item.created_at)}</span>
        {item.reading_time_minutes ? <><span>·</span><span>~{item.reading_time_minutes}m</span></> : null}
        <span>·</span>
        <button onClick={onCycleStatus}
          className={`px-1 py-px border text-[9px] transition-colors ${
            status === "reading" ? "border-oxblood text-oxblood" :
            status === "read" ? "border-sage text-sage" :
            status === "archived" ? "border-rule text-muted" :
            "border-rule text-muted hover:border-ink hover:text-ink"
          }`}>
          {STATUS_LABELS[status]}
        </button>
      </div>
      {/* Line 2: title */}
      <p className={`font-serif text-[17px] font-semibold leading-tight truncate mb-1 ${selected ? "text-oxblood" : "text-ink"}`}>
        {item.title || item.url}
      </p>
      {/* Line 3: truncated summary */}
      {item.summary && (
        <p className="font-serif italic text-[14px] text-muted leading-snug truncate mb-1">
          {trunc(item.summary, 110)}
        </p>
      )}
      {/* Line 4: tags — sage for user-added, muted for LLM */}
      {item.tags && item.tags.length > 0 && (
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase truncate">
          {item.tags.slice(0, 3).map((t, i) => {
            const isUser = (item.user_tags ?? []).includes(t);
            return (
              <span key={t} className={isUser ? "text-sage" : "text-muted/70"}>
                {!isUser && <span className="text-[8px]">✦ </span>}{t}{i < Math.min(item.tags!.length, 3) - 1 ? ", " : ""}
              </span>
            );
          })}{item.tags.length > 3 ? "…" : ""}
        </p>
      )}
    </li>
  );
}

// ── Right pane ───────────────────────────────────────────────────────────────

function RightPane({
  item, allItems, onUpdate, onRemove,
}: {
  item: ReadingItem | null; allItems: ReadingItem[];
  onUpdate: (id: string, updates: Partial<ReadingItem>) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [notesValue, setNotesValue] = useState(item?.notes ?? "");
  const [highlights, setHighlights] = useState<ArticleHighlight[]>([]);
  const [newHighlight, setNewHighlight] = useState("");
  const [addingHighlight, setAddingHighlight] = useState(false);
  const [annotating, setAnnotating] = useState(false);

  useEffect(() => { setNotesValue(item?.notes ?? ""); }, [item?.id, item?.notes]);

  // Fetch highlights whenever selected item changes
  useEffect(() => {
    if (!item) { setHighlights([]); return; }
    fetch(`/api/items/${item.id}/highlights`)
      .then(r => r.ok ? r.json() : [])
      .then(setHighlights)
      .catch(() => setHighlights([]));
  }, [item?.id]);

  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-serif italic text-[14px] text-muted text-center leading-relaxed">
          Select an article to see its margins.
        </p>
      </div>
    );
  }

  const status = (item.status ?? "queued") as Status;

  async function saveNotes() {
    if (notesValue !== (item!.notes ?? "")) {
      await onUpdate(item!.id, { notes: notesValue || null });
    }
  }

  async function addHighlight() {
    const text = newHighlight.trim();
    if (!text) return;
    setNewHighlight(""); setAddingHighlight(false);
    const res = await fetch(`/api/items/${item!.id}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) { const h: ArticleHighlight = await res.json(); setHighlights(prev => [...prev, h]); }
  }

  async function removeHighlight(hid: string) {
    setHighlights(prev => prev.filter(h => h.id !== hid));
    await fetch(`/api/items/${item!.id}/highlights/${hid}`, { method: "DELETE" });
  }

  async function reAnnotate() {
    setAnnotating(true);
    try {
      const res = await fetch(`/api/items/${item!.id}/annotate`, { method: "POST" });
      if (res.ok) onUpdate(item!.id, await res.json());
    } finally { setAnnotating(false); }
  }

  // Resolve referenced articles
  const referencedItems = (item.editorial_references ?? [])
    .map(id => allItems.find(i => i.id === id))
    .filter(Boolean) as ReadingItem[];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Source + date */}
      <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
        {hostname(item.url)} · {formatDate(item.created_at)}
      </div>

      {/* Title + links */}
      <div>
        <h2 className="font-serif text-[28px] font-semibold leading-tight mb-2">
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="link-underline hover:text-oxblood transition-colors">
            {item.title || item.url}
          </a>
        </h2>
        <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.15em] uppercase">
          <button onClick={() => onUpdate(item.id, { status: nextStatus(status) })}
            className={`px-2 py-0.5 border transition-colors ${
              status === "reading" ? "border-oxblood text-oxblood" :
              status === "read" ? "border-sage text-sage" :
              status === "archived" ? "border-rule text-muted" :
              "border-rule text-muted hover:border-ink hover:text-ink"
            }`}>
            {STATUS_LABELS[status]}
          </button>
          <Link href={`/items/${item.id}`}
            className="text-muted hover:text-oxblood transition-colors">
            Read ↗
          </Link>
          <button onClick={() => onRemove(item.id)} className="text-muted hover:text-oxblood transition-colors">
            Remove
          </button>
        </div>
      </div>

      {/* Rating */}
      <StarRating value={item.rating} onChange={n => onUpdate(item.id, { rating: n })} />

      {/* Summary */}
      {item.summary && (
        <p className="summary font-serif text-[17px] leading-relaxed text-ink/85">
          {item.summary}
        </p>
      )}

      {/* Editorial annotation */}
      {item.editorial_note && (
        <div className="flex gap-3">
          <div className="w-px bg-oxblood/60 flex-shrink-0" />
          <div>
            <p className="font-serif italic text-[14px] leading-relaxed text-ink/70">
              {item.editorial_note}
            </p>
            {referencedItems.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-3 font-mono text-[9px] tracking-[0.12em] uppercase text-muted">
                {referencedItems.map(r => (
                  <span key={r.id} className="text-oxblood/70">{r.title ? trunc(r.title, 40) : hostname(r.url)}</span>
                ))}
              </div>
            )}
            <button onClick={reAnnotate} disabled={annotating}
              className="mt-1 font-mono text-[10px] uppercase text-muted hover:text-ink transition-colors disabled:opacity-40">
              {annotating ? "…" : "↻"}
            </button>
          </div>
        </div>
      )}

      {/* Tags — sage = user-added, muted = LLM-extracted */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.12em] uppercase">
          {item.tags.map(t => {
            const isUser = (item.user_tags ?? []).includes(t);
            return (
              <span key={t} className={isUser ? "text-sage" : "text-muted/70"}>
                {!isUser && <span className="text-[8px]">✦ </span>}· {t}
              </span>
            );
          })}
        </div>
      )}

      {/* Notes */}
      <div>
        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">Notes</div>
        <textarea
          value={notesValue}
          onChange={e => setNotesValue(e.target.value)}
          onBlur={saveNotes}
          placeholder="Your thoughts…"
          rows={4}
          className="w-full bg-transparent border border-rule focus:border-oxblood outline-none px-3 py-2 font-serif text-[15px] text-ink placeholder:text-muted/50 resize-y transition-colors"
        />
      </div>

      {/* Highlights */}
      <div>
        <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">Highlights</div>
        {highlights.length > 0 && (
          <ul className="space-y-3 mb-3">
            {highlights.map(h => (
              <li key={h.id} className="flex items-start gap-2 group/hl">
                <div className="w-[2px] bg-oxblood/60 flex-shrink-0 self-stretch mt-0.5" />
                <p className="font-serif italic text-[14px] text-ink/80 flex-1 leading-snug">{h.text}</p>
                <button onClick={() => removeHighlight(h.id)}
                  className="opacity-0 group-hover/hl:opacity-100 transition-opacity text-muted hover:text-oxblood text-xs">✕</button>
              </li>
            ))}
          </ul>
        )}
        {addingHighlight ? (
          <div className="flex gap-2">
            <input autoFocus value={newHighlight} onChange={e => setNewHighlight(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addHighlight(); if (e.key === "Escape") { setAddingHighlight(false); setNewHighlight(""); } }}
              placeholder="Paste a quote…"
              className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-1 font-serif text-[14px] placeholder:text-muted/50 transition-colors" />
            <button onClick={addHighlight} className="font-mono text-[10px] uppercase text-oxblood hover:text-ink transition-colors">Add</button>
            <button onClick={() => { setAddingHighlight(false); setNewHighlight(""); }} className="font-mono text-[10px] uppercase text-muted hover:text-ink transition-colors">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAddingHighlight(true)} className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors">
            + add highlight
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ReadingList({
  initialItems, initialThemes, userName, projectId, projects, projectName,
}: {
  initialItems: ReadingItem[]; initialThemes: ReadingTheme[]; userName: string;
  projectId?: string; projects?: Project[]; projectName?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("queued");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [angle, setAngle] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [themes, setThemes] = useState<ReadingTheme[]>(initialThemes);
  const [themeFilter, setThemeFilter] = useState<string | null>(null);
  const [generatingThemes, setGeneratingThemes] = useState(false);
  const [themesError, setThemesError] = useState<string | null>(null);
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const [bookmarkletHref, setBookmarkletHref] = useState<string>("#");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build bookmarklet href with current origin (must run client-side)
  useEffect(() => {
    const origin = window.location.origin;
    const js = `javascript:(function(){window.open('${origin}/quick-save?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title)+'&popup=1','_blank','width=440,height=280,scrollbars=no,resizable=no,toolbar=no');})()`;
    setBookmarkletHref(js);
  }, []);

  // Lazy annotation backfill
  useEffect(() => {
    const missing = items.filter(i => !i.editorial_note && i.summary).slice(0, 5).map(i => i.id);
    if (!missing.length) return;
    fetch("/api/items/backfill-annotations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_ids: missing }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced semantic search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) { setSearchResults(null); setSearchError(null); setSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true); setSearchError(null);
      try {
        const res = await fetch("/api/search", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: searchQuery.trim() }),
        });
        const json = await res.json();
        if (!res.ok) { setSearchError(json?.error ?? "Search failed"); setSearchResults(null); }
        else setSearchResults(json);
      } catch { setSearchError("Search request failed."); }
      finally { setSearching(false); }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  const counts = {
    queued:   items.filter(i => i.status === "queued").length,
    reading:  items.filter(i => i.status === "reading").length,
    read:     items.filter(i => i.status === "read").length,
    archived: items.filter(i => i.status === "archived").length,
    all:      items.length,
  };

  // Total reading time for queued items
  const queuedMinutes = items
    .filter(i => i.status === "queued" && i.reading_time_minutes)
    .reduce((acc, i) => acc + (i.reading_time_minutes ?? 0), 0);
  const queueTime = queuedMinutes >= 60
    ? `~${Math.floor(queuedMinutes / 60)}h ${queuedMinutes % 60}m`
    : `~${queuedMinutes}m`;

  const filteredItems = isSearching
    ? (searchResults ?? [])
    : items.filter(i => {
        const s = i.status ?? "queued";
        const tabOk = tab === "all" ? true : s === tab;
        const tagsOk = tagFilters.every(t => i.tags?.includes(t));
        const themeOk = !themeFilter ? true : (themes.find(th => th.id === themeFilter)?.item_ids ?? []).includes(i.id);
        return tabOk && tagsOk && themeOk;
      });

  const selectedItem = items.find(i => i.id === selectedItemId) ?? null;

  async function saveUrl(target: string) {
    setError(null); setLoading(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = await res.json();
      if (res.status === 409) { setError("Already on your shelf."); setUrl(""); return; }
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setItems(prev => [data, ...prev]);
      setUrl("");
      setSelectedItemId(data.id);
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setLoading(false); }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    await saveUrl(url.trim());
  }

  function handleUrlPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    try {
      new URL(pasted);
      e.preventDefault();
      setUrl(pasted);
      saveUrl(pasted);
    } catch { /* not a URL — normal paste */ }
  }

  async function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    if (searchResults) setSearchResults(prev => prev?.filter(i => i.id !== id) ?? null);
    if (selectedItemId === id) setSelectedItemId(null);
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  async function updateItem(id: string, updates: Partial<ReadingItem>) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems(prev => prev.map(i => i.id === id ? updated : i));
      if (searchResults) setSearchResults(prev => prev?.map(i => i.id === id ? { ...updated, similarity: (i as SearchResult).similarity } : i) ?? null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      if (next.size >= 8) return prev;
      next.add(id); return next;
    });
  }

  async function startDraft() {
    if (selectedIds.size < 2) return;
    setDrafting(true);
    try {
      const res = await fetch("/api/synthesize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_ids: [...selectedIds], angle: angle || undefined }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error); return; }
      router.push(`/synthesis/${json.id}`);
    } finally { setDrafting(false); }
  }

  async function runBackfill() {
    setBackfillStatus("Embedding…");
    try {
      const res = await fetch("/api/items/backfill-embeddings", { method: "POST" });
      const { processed, failed } = await res.json();
      setBackfillStatus(`Embedded ${processed}${failed ? `, ${failed} failed` : ""}`);
    } catch { setBackfillStatus("Failed"); }
  }

  async function generateThemes() {
    setGeneratingThemes(true); setThemesError(null);
    try {
      const res = await fetch("/api/themes", { method: "POST" });
      const json = await res.json();
      if (!res.ok) { setThemesError(json.error ?? "Failed"); return; }
      const updated = await fetch("/api/themes").then(r => r.json());
      setThemes(updated ?? []);
    } catch { setThemesError("Failed to generate themes."); }
    finally { setGeneratingThemes(false); }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "queued",   label: "Queued"   },
    { key: "reading",  label: "Reading"  },
    { key: "read",     label: "Read"     },
    { key: "archived", label: "Archived" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Center pane ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-rule overflow-hidden">
        {/* Top: wordmark + inputs */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-rule">
          <WelcomePanel userName={userName} />
          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-serif text-[22px] font-semibold leading-none tracking-tight truncate">
              {projectName ? projectName : <span>Inbox</span>}
            </h1>
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
              <a href="/synthesis" className="hover:text-ink transition-colors">Drafts</a>
              <button onClick={generateThemes} disabled={generatingThemes}
                className="hover:text-ink transition-colors disabled:opacity-40">
                {generatingThemes ? "…" : "Themes"}
              </button>
              <button onClick={runBackfill} disabled={backfillStatus === "Embedding…"}
                className="hover:text-ink transition-colors disabled:opacity-40">
                {backfillStatus ?? "Embed"}
              </button>
              <a
                href={bookmarkletHref}
                title="Drag this to your bookmarks bar to save any page in one click"
                onClick={e => e.preventDefault()}
                draggable
                className="hover:text-ink transition-colors cursor-grab active:cursor-grabbing select-none"
              >
                Bookmarklet
              </a>
            </div>
          </div>
          {/* URL input */}
          <form onSubmit={addItem} className="flex items-center gap-2 mb-2">
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              onPaste={handleUrlPaste}
              onKeyDown={e => { if (e.key === "Escape") { setUrl(""); setError(null); (e.target as HTMLInputElement).blur(); } }}
              placeholder="https://…" required disabled={loading}
              className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-2 font-serif italic text-[16px] placeholder:text-muted/60 transition-colors disabled:opacity-50 h-12" />
            <span className="font-mono text-[10px] text-muted/50 flex-shrink-0">
              {loading ? "…" : "↵"}
            </span>
          </form>
          {error && <p className="font-serif italic text-oxblood text-sm mb-1">{error}</p>}
          {/* Search */}
          <div className="relative">
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by concept…"
              className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-1.5 font-serif text-[15px] placeholder:text-muted/50 transition-colors h-10 pr-6" />
            {searching && <span className="absolute right-1 top-2 font-mono text-[10px] text-muted animate-pulse">…</span>}
            {searchQuery && !searching && (
              <button onClick={() => setSearchQuery("")} className="absolute right-1 top-2 font-mono text-[10px] text-muted hover:text-ink transition-colors">✕</button>
            )}
          </div>
          {searchError && <p className="font-serif italic text-oxblood text-sm mt-1">{searchError}</p>}
        </div>

        {/* Tab strip */}
        {!isSearching && (
          <div className="flex-shrink-0 border-b border-rule">
            <div className="flex items-center px-5">
              {TABS.map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`font-mono text-[10px] tracking-[0.15em] uppercase py-3 pr-4 transition-colors ${
                    tab === key ? "text-ink border-b-2 border-ink" : "text-muted hover:text-ink border-b-2 border-transparent"
                  }`}>
                  {label} · {counts[key as keyof typeof counts]}
                </button>
              ))}
              <button onClick={() => setTab("all")}
                className={`ml-auto font-mono text-[10px] tracking-[0.15em] uppercase py-3 transition-colors ${
                  tab === "all" ? "text-ink" : "text-muted hover:text-ink"
                }`}>
                All · {counts.all}
              </button>
            </div>
            {tab === "queued" && queuedMinutes > 0 && (
              <p className="px-5 pb-2 font-mono text-[9px] tracking-[0.12em] uppercase text-muted">
                Queue: {counts.queued} {counts.queued === 1 ? "item" : "items"} · {queueTime}
              </p>
            )}
          </div>
        )}

        {/* Themes strip */}
        {!isSearching && themes.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 border-b border-rule overflow-x-auto">
            {themeFilter && (
              <button onClick={() => setThemeFilter(null)}
                className="font-mono text-[9px] tracking-[0.12em] uppercase text-oxblood flex-shrink-0 hover:text-ink transition-colors">
                ✕ clear
              </button>
            )}
            {themes.map(th => (
              <button key={th.id} onClick={() => setThemeFilter(themeFilter === th.id ? null : th.id)}
                className={`font-mono text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 border flex-shrink-0 transition-colors ${
                  themeFilter === th.id
                    ? "border-oxblood text-oxblood"
                    : "border-rule text-muted hover:border-ink hover:text-ink"
                }`}>
                {th.name}
              </button>
            ))}
          </div>
        )}
        {themesError && (
          <div className="flex-shrink-0 px-5 py-1">
            <p className="font-serif italic text-oxblood text-[12px]">{themesError}</p>
          </div>
        )}

        {/* Select for draft + search info */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 py-1.5">
          {isSearching && !searching && searchResults !== null && (
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
              {searchResults.length === 0 ? "No results above 50% match" : `${searchResults.length} result${searchResults.length > 1 ? "s" : ""}`}
            </span>
          )}
          {!isSearching && <span />}
          <div className="flex items-center gap-3">
            {selectMode && selectedIds.size > 0 && projects && projects.length > 0 && (
              <select
                onChange={async e => {
                  const pid = e.target.value;
                  if (!pid) return;
                  await fetch(`/api/projects/${pid}/items`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ item_ids: [...selectedIds] }),
                  });
                  e.target.value = "";
                }}
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted bg-transparent border-b border-rule outline-none cursor-pointer hover:text-ink"
                defaultValue=""
              >
                <option value="" disabled>assign to project…</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
                ))}
              </select>
            )}
            <button onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }}
              className={`font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${selectMode ? "text-oxblood" : "text-muted hover:text-ink"}`}>
              {selectMode ? "✕ cancel" : "select for draft"}
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filteredItems.length === 0 && !searching ? (
            <p className="font-serif italic text-muted text-center py-16 text-[16px]">
              {isSearching ? "Nothing found. Try different phrasing." : "Nothing here yet."}
            </p>
          ) : (
            <ul>
              {(filteredItems as Array<ReadingItem & { similarity?: number }>).map(item => (
                <ListItem
                  key={item.id}
                  item={item}
                  selected={selectedItemId === item.id}
                  selectMode={selectMode}
                  inSelectedSet={selectedIds.has(item.id)}
                  onSelect={() => setSelectedItemId(selectedItemId === item.id ? null : item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onCycleStatus={e => { e.stopPropagation(); updateItem(item.id, { status: nextStatus((item.status ?? "queued") as Status) }); }}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Footer count */}
        <div className="flex-shrink-0 px-5 py-2 border-t border-rule font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
          {items.length} {items.length === 1 ? "entry" : "entries"}
        </div>
      </div>

      {/* ── Right pane (contextual marginalia) ──────────────────────────── */}
      <div className="hidden lg:flex flex-col w-[35%] min-w-[280px] max-w-[420px] overflow-hidden">
        <RightPane
          item={selectedItem}
          allItems={items}
          onUpdate={updateItem}
          onRemove={removeItem}
        />
      </div>

      {/* ── Floating synthesis bar ───────────────────────────────────────── */}
      {selectMode && selectedIds.size >= 2 && (
        <div className="fixed bottom-0 left-[60px] right-0 z-50 bg-paper border-t border-rule px-6 py-4 md:bottom-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 max-w-3xl">
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted flex-shrink-0">
              {selectedIds.size} / 8 selected
            </span>
            <input type="text" value={angle} onChange={e => setAngle(e.target.value)}
              placeholder="Optional focus…"
              className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-1 font-serif text-base placeholder:text-muted/50 transition-colors" />
            <button onClick={startDraft} disabled={drafting}
              className="border border-oxblood text-oxblood px-5 py-2 font-mono text-[10px] tracking-[0.15em] uppercase hover:bg-oxblood hover:text-paper transition-colors disabled:opacity-40 flex-shrink-0">
              {drafting ? "Creating…" : `Draft (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
