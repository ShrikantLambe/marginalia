"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReadingItem, Highlight, SearchResult, ReadingTheme } from "@/lib/supabase";

type Status = "unread" | "reading" | "read" | "archived";
type Tab = "later" | "read" | "archive" | "all";

const STATUS_CYCLE: Status[] = ["unread", "reading", "read", "archived"];
const STATUS_LABELS: Record<Status, string> = { unread: "Unread", reading: "Reading", read: "Read", archived: "Archived" };

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
  const status = (item.status ?? "unread") as Status;
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
      {/* Line 4: tags */}
      {item.tags && item.tags.length > 0 && (
        <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-sage truncate">
          {item.tags.slice(0, 3).join(", ")}{item.tags.length > 3 ? "…" : ""}
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
  const [newHighlight, setNewHighlight] = useState("");
  const [addingHighlight, setAddingHighlight] = useState(false);
  const [annotating, setAnnotating] = useState(false);

  useEffect(() => { setNotesValue(item?.notes ?? ""); }, [item?.id, item?.notes]);

  if (!item) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="font-serif italic text-[14px] text-muted text-center leading-relaxed">
          Select an article to see its margins.
        </p>
      </div>
    );
  }

  const highlights: Highlight[] = Array.isArray(item.highlights) ? item.highlights : [];
  const status = (item.status ?? "unread") as Status;

  async function saveNotes() {
    if (notesValue !== (item!.notes ?? "")) {
      await onUpdate(item!.id, { notes: notesValue || null });
    }
  }

  async function addHighlight() {
    const text = newHighlight.trim();
    if (!text) return;
    const next: Highlight[] = [...highlights, { text, created_at: new Date().toISOString() }];
    setNewHighlight(""); setAddingHighlight(false);
    await onUpdate(item!.id, { highlights: next });
  }

  async function removeHighlight(idx: number) {
    await onUpdate(item!.id, { highlights: highlights.filter((_, i) => i !== idx) });
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

      {/* Title + open link */}
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

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.12em] uppercase text-sage">
          {item.tags.map(t => <span key={t}>· {t}</span>)}
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
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 group/hl">
                <div className="w-[2px] bg-oxblood/60 flex-shrink-0 self-stretch mt-0.5" />
                <p className="font-serif italic text-[14px] text-ink/80 flex-1 leading-snug">{h.text}</p>
                <button onClick={() => removeHighlight(i)}
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
  initialItems, initialThemes, userName,
}: {
  initialItems: ReadingItem[]; initialThemes: ReadingTheme[]; userName: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("later");
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
  const [backfillStatus, setBackfillStatus] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    later: items.filter(i => i.status === "unread" || i.status === "reading").length,
    read: items.filter(i => i.status === "read").length,
    archive: items.filter(i => i.status === "archived").length,
    all: items.length,
  };

  const filteredItems = isSearching
    ? (searchResults ?? [])
    : items.filter(i => {
        const s = i.status ?? "unread";
        const tabOk = tab === "later" ? (s === "unread" || s === "reading")
          : tab === "read" ? s === "read"
          : tab === "archive" ? s === "archived"
          : true;
        const tagsOk = tagFilters.every(t => i.tags?.includes(t));
        return tabOk && tagsOk;
      });

  const selectedItem = items.find(i => i.id === selectedItemId) ?? null;

  async function addItem(e: React.FormEvent) {
    e.preventDefault(); setError(null); if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
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
    setBackfillStatus("Indexing…");
    try {
      const res = await fetch("/api/items/backfill-embeddings", { method: "POST" });
      const { processed, failed } = await res.json();
      setBackfillStatus(`Indexed ${processed}${failed ? `, ${failed} failed` : ""}`);
    } catch { setBackfillStatus("Failed"); }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "later", label: "Later" },
    { key: "read", label: "Read" },
    { key: "archive", label: "Archive" },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Center pane ─────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-rule overflow-hidden">
        {/* Top: wordmark + inputs */}
        <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-rule">
          {/* Wordmark row */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="font-serif text-[28px] font-semibold leading-none tracking-tight">
              Marg<span className="text-oxblood">i</span>nalia
            </h1>
            <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
              <a href="/synthesis" className="hover:text-ink transition-colors">Drafts</a>
              <button onClick={runBackfill} disabled={backfillStatus === "Indexing…"}
                className="hover:text-ink transition-colors disabled:opacity-40">
                {backfillStatus ?? "Index"}
              </button>
            </div>
          </div>
          {/* URL input */}
          <form onSubmit={addItem} className="flex gap-2 mb-2">
            <input type="url" value={url} onChange={e => setUrl(e.target.value)}
              placeholder="https://…" required disabled={loading}
              className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-2 font-serif italic text-[16px] placeholder:text-muted/60 transition-colors disabled:opacity-50 h-12" />
            <button type="submit" disabled={loading || !url.trim()}
              className="border border-oxblood text-oxblood px-4 font-mono text-[10px] tracking-[0.18em] uppercase hover:bg-oxblood hover:text-paper transition-colors disabled:opacity-40 h-12 flex-shrink-0">
              {loading ? "…" : "Save"}
            </button>
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
          <div className="flex-shrink-0 flex items-center px-5 border-b border-rule">
            {TABS.map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key)}
                className={`font-mono text-[10px] tracking-[0.15em] uppercase py-3 pr-4 transition-colors ${
                  tab === key ? "text-ink border-b-2 border-ink" : "text-muted hover:text-ink border-b-2 border-transparent"
                }`}>
                {label} · {counts[key]}
              </button>
            ))}
            <button onClick={() => setTab("all")}
              className={`ml-auto font-mono text-[10px] tracking-[0.15em] uppercase py-3 transition-colors ${
                tab === "all" ? "text-ink" : "text-muted hover:text-ink"
              }`}>
              All · {counts.all}
            </button>
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
          <button onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()); }}
            className={`font-mono text-[10px] tracking-[0.12em] uppercase transition-colors ${selectMode ? "text-oxblood" : "text-muted hover:text-ink"}`}>
            {selectMode ? "✕ cancel" : "select for draft"}
          </button>
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
                  onCycleStatus={e => { e.stopPropagation(); updateItem(item.id, { status: nextStatus((item.status ?? "unread") as Status) }); }}
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
