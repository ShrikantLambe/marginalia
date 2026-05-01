"use client";

import { useState, useEffect, useRef } from "react";
import { useUser, UserButton } from "@stackframe/stack";
import type { ReadingItem, Highlight, SearchResult } from "@/lib/supabase";

type Status = "unread" | "reading" | "read" | "archived";
type Filter = "active" | "unread" | "reading" | "read" | "archived" | "all";

const STATUS_CYCLE: Status[] = ["unread", "reading", "read", "archived"];
const STATUS_LABELS: Record<Status, string> = {
  unread: "Unread",
  reading: "Reading",
  read: "Read",
  archived: "Archived",
};

function nextStatus(current: Status): Status {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
}

function getTodaysPick(
  items: ReadingItem[],
  dismissed: Record<string, string>
): ReadingItem | null {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const eligible = items.filter((item) => {
    if (item.status !== "unread" && item.status !== "reading") return false;
    if (new Date(item.created_at) > weekAgo) return false;
    const until = dismissed[item.id];
    if (until && new Date(until) > now) return false;
    return true;
  });
  eligible.sort((a, b) => {
    if (!a.last_opened_at && !b.last_opened_at) return 0;
    if (!a.last_opened_at) return -1;
    if (!b.last_opened_at) return 1;
    return new Date(a.last_opened_at).getTime() - new Date(b.last_opened_at).getTime();
  });
  return eligible[0] ?? null;
}

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return url; }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Star rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number | null; onChange: (n: number | null) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onChange(value === n ? null : n)}
          className={`text-base leading-none transition-colors ${(hover ?? value ?? 0) >= n ? "text-oxblood" : "text-rule"}`}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >★</button>
      ))}
    </div>
  );
}

// ── Single reading item ──────────────────────────────────────────────────────

function Item({
  item,
  similarity,
  onUpdate,
  onRemove,
  onTagClick,
  activeTagFilters,
}: {
  item: ReadingItem;
  similarity?: number;
  onUpdate: (id: string, updates: Partial<ReadingItem>) => Promise<void>;
  onRemove: (id: string) => void;
  onTagClick: (tag: string) => void;
  activeTagFilters: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes ?? "");
  const [newHighlight, setNewHighlight] = useState("");
  const [addingHighlight, setAddingHighlight] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryValue, setSummaryValue] = useState(item.summary ?? "");
  const [editingTags, setEditingTags] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Keep local state in sync when item updates from search results
  useEffect(() => {
    setNotesValue(item.notes ?? "");
    setSummaryValue(item.summary ?? "");
  }, [item.notes, item.summary]);

  const highlights: Highlight[] = Array.isArray(item.highlights) ? item.highlights : [];
  const status: Status = (item.status as Status) ?? "unread";

  function handleTitleClick() {
    navigator.sendBeacon(`/api/items/${item.id}/open`);
  }

  async function cycleStatus() {
    await onUpdate(item.id, { status: nextStatus(status) });
  }

  async function saveNotes() {
    if (notesValue !== (item.notes ?? "")) {
      await onUpdate(item.id, { notes: notesValue || null });
    }
  }

  async function saveSummary() {
    setEditingSummary(false);
    if (summaryValue !== (item.summary ?? "")) {
      await onUpdate(item.id, { summary: summaryValue || null });
    }
  }

  async function removeTag(tag: string) {
    const next = (item.tags ?? []).filter((t) => t !== tag);
    await onUpdate(item.id, { tags: next });
  }

  async function addTag() {
    const tag = newTag.trim().toLowerCase();
    if (!tag || (item.tags ?? []).includes(tag)) { setNewTag(""); return; }
    await onUpdate(item.id, { tags: [...(item.tags ?? []), tag] });
    setNewTag("");
  }

  async function addHighlight() {
    const text = newHighlight.trim();
    if (!text) return;
    const next: Highlight[] = [...highlights, { text, created_at: new Date().toISOString() }];
    setNewHighlight("");
    setAddingHighlight(false);
    await onUpdate(item.id, { highlights: next });
  }

  async function removeHighlight(idx: number) {
    await onUpdate(item.id, { highlights: highlights.filter((_, i) => i !== idx) });
  }

  return (
    <li className="group">
      <article className="border-b border-rule pb-10">
        {/* Metadata row */}
        <div className="flex items-center justify-between mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted">
          <span className="flex items-center gap-2">
            {hostname(item.url)}&nbsp;·&nbsp;{formatDate(item.created_at)}
            {similarity !== undefined && (
              <span className="text-sage">{Math.round(similarity * 100)}% match</span>
            )}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={cycleStatus}
              title={`Mark as ${nextStatus(status)}`}
              className={`px-2 py-0.5 border transition-colors ${
                status === "reading" ? "border-oxblood text-oxblood"
                : status === "read" ? "border-sage text-sage"
                : status === "archived" ? "border-rule text-muted"
                : "border-rule text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-oxblood"
              aria-label="Remove from list"
            >Remove</button>
          </div>
        </div>

        {/* Title */}
        <h2 className="font-serif text-2xl md:text-3xl font-semibold leading-tight mb-4">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleTitleClick}
            className="link-underline"
          >
            {item.title || item.url}
          </a>
        </h2>

        {/* Summary — click to edit */}
        {editingSummary ? (
          <textarea
            autoFocus
            value={summaryValue}
            onChange={(e) => setSummaryValue(e.target.value)}
            onBlur={saveSummary}
            rows={4}
            className="w-full bg-transparent border border-rule focus:border-oxblood outline-none px-3 py-2 font-serif text-lg leading-relaxed text-ink resize-y transition-colors mb-4"
          />
        ) : (
          item.summary && (
            <p
              className="summary font-serif text-lg leading-relaxed text-ink/85 mb-4 cursor-text"
              onClick={() => setEditingSummary(true)}
              title="Click to edit summary"
            >
              {item.summary}
            </p>
          )
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.15em] uppercase mb-4">
            {item.tags.map((t) => (
              <button
                key={t}
                onClick={() => onTagClick(t)}
                className={`transition-colors ${
                  activeTagFilters.includes(t) ? "text-oxblood" : "text-sage hover:text-oxblood"
                }`}
              >· {t}</button>
            ))}
          </div>
        )}

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors"
        >
          {expanded ? "▴ close" : "▾ notes & highlights"}
          {!expanded && item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
        </button>

        {expanded && (
          <div className="mt-4 space-y-5 pl-1">
            {/* Rating */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted w-16">Rating</span>
              <StarRating value={item.rating} onChange={(n) => onUpdate(item.id, { rating: n })} />
            </div>

            {/* Notes */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">Notes</div>
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                onBlur={saveNotes}
                placeholder="Your thoughts…"
                rows={3}
                className="w-full bg-transparent border border-rule focus:border-oxblood outline-none px-3 py-2 font-serif text-base text-ink placeholder:text-muted/50 resize-y transition-colors"
              />
            </div>

            {/* Tags editor */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">Tags</div>
              <div className="flex flex-wrap gap-2 mb-2">
                {(item.tags ?? []).map((t) => (
                  <span key={t} className="flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] uppercase text-sage border border-rule px-2 py-0.5">
                    {t}
                    <button onClick={() => removeTag(t)} className="text-muted hover:text-oxblood ml-1">✕</button>
                  </span>
                ))}
              </div>
              {editingTags ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTag();
                      if (e.key === "Escape") { setEditingTags(false); setNewTag(""); }
                    }}
                    placeholder="new tag"
                    className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-1 font-mono text-xs placeholder:text-muted/50 transition-colors"
                  />
                  <button onClick={addTag} className="font-mono text-[10px] tracking-[0.15em] uppercase text-oxblood hover:text-ink transition-colors">Add</button>
                  <button onClick={() => { setEditingTags(false); setNewTag(""); }} className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setEditingTags(true)} className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors">+ add tag</button>
              )}
            </div>

            {/* Highlights */}
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">Highlights</div>
              {highlights.length > 0 && (
                <ul className="space-y-2 mb-3">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 group/hl">
                      <span className="text-oxblood mt-1 text-xs">❝</span>
                      <p className="font-serif text-base text-ink/80 flex-1 leading-snug">{h.text}</p>
                      <button
                        onClick={() => removeHighlight(i)}
                        className="opacity-0 group-hover/hl:opacity-100 transition-opacity text-muted hover:text-oxblood text-xs mt-0.5 flex-shrink-0"
                        aria-label="Remove highlight"
                      >✕</button>
                    </li>
                  ))}
                </ul>
              )}
              {addingHighlight ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={newHighlight}
                    onChange={(e) => setNewHighlight(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addHighlight();
                      if (e.key === "Escape") { setAddingHighlight(false); setNewHighlight(""); }
                    }}
                    placeholder="Paste a quote…"
                    className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-1 font-serif text-base placeholder:text-muted/50 transition-colors"
                  />
                  <button onClick={addHighlight} className="font-mono text-[10px] tracking-[0.15em] uppercase text-oxblood hover:text-ink transition-colors">Add</button>
                  <button onClick={() => { setAddingHighlight(false); setNewHighlight(""); }} className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddingHighlight(true)} className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors">+ add highlight</button>
              )}
            </div>
          </div>
        )}
      </article>
    </li>
  );
}

// ── Today's Pick card ────────────────────────────────────────────────────────

function TodaysPick({ item, onMarkRead, onDismiss }: {
  item: ReadingItem;
  onMarkRead: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="mb-10 border border-rule p-6 rise">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-oxblood mb-3">Today's Pick</div>
      <h3 className="font-serif text-xl font-semibold leading-tight mb-2">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => navigator.sendBeacon(`/api/items/${item.id}/open`)}
          className="link-underline"
        >
          {item.title || item.url}
        </a>
      </h3>
      {item.summary && (
        <p className="font-serif text-base text-ink/75 leading-relaxed mb-4 line-clamp-3">{item.summary}</p>
      )}
      <div className="flex gap-4 font-mono text-[10px] tracking-[0.15em] uppercase">
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          onClick={() => navigator.sendBeacon(`/api/items/${item.id}/open`)}
          className="text-oxblood hover:text-ink transition-colors">Open →</a>
        <button onClick={onMarkRead} className="text-sage hover:text-ink transition-colors">Mark read</button>
        <button onClick={onDismiss} className="text-muted hover:text-ink transition-colors">Not now</button>
      </div>
    </section>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ReadingList({ initialItems, userName }: {
  initialItems: ReadingItem[];
  userName: string;
}) {
  const user = useUser();
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("marginalia_dismissed") ?? "{}"); }
    catch { return {}; }
  });

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: searchQuery.trim(),
            status: filter === "active" ? ["unread", "reading"]
              : filter === "all" ? undefined
              : filter === "archived" ? ["archived"]
              : [filter],
            tags: tagFilters.length ? tagFilters : undefined,
          }),
        });
        if (res.ok) setSearchResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, filter, tagFilters]);

  const counts = {
    active: items.filter((i) => i.status === "unread" || i.status === "reading").length,
    unread: items.filter((i) => i.status === "unread").length,
    reading: items.filter((i) => i.status === "reading").length,
    read: items.filter((i) => i.status === "read").length,
    archived: items.filter((i) => i.status === "archived").length,
    all: items.filter((i) => i.status !== "archived").length,
  };

  const filteredItems = items.filter((item) => {
    const s = item.status ?? "unread";
    const statusOk = filter === "active" ? s === "unread" || s === "reading"
      : filter === "all" ? s !== "archived"
      : s === filter;
    const tagsOk = tagFilters.every((t) => item.tags?.includes(t));
    return statusOk && tagsOk;
  });

  const isSearching = searchQuery.trim().length > 0;
  const displayItems = isSearching ? (searchResults ?? []) : filteredItems;
  const todaysPick = isSearching ? null : getTodaysPick(items, dismissed);

  function toggleTagFilter(tag: string) {
    setTagFilters((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!url.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setItems((prev) => [data, ...prev]);
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (searchResults) setSearchResults((prev) => prev?.filter((i) => i.id !== id) ?? null);
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  async function updateItem(id: string, updates: Partial<ReadingItem>) {
    const res = await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const updated = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      if (searchResults) {
        setSearchResults((prev) =>
          prev?.map((i) => (i.id === id ? { ...updated, similarity: i.similarity } : i)) ?? null
        );
      }
    }
  }

  function dismissPick(id: string) {
    const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const next = { ...dismissed, [id]: until };
    setDismissed(next);
    localStorage.setItem("marginalia_dismissed", JSON.stringify(next));
  }

  const TABS: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: "Unread & Reading", count: counts.active },
    { key: "unread", label: "Unread", count: counts.unread },
    { key: "reading", label: "Reading", count: counts.reading },
    { key: "read", label: "Read", count: counts.read },
    { key: "archived", label: "Archived", count: counts.archived },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-rule pb-6 mb-10">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">The Reading Room</div>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">
            Marg<span className="text-oxblood">i</span>nalia
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-serif italic text-ink/60 text-sm hidden sm:inline">for {userName}</span>
          {user ? <UserButton /> : null}
        </div>
      </header>

      {/* Today's Pick */}
      {todaysPick && (
        <TodaysPick
          item={todaysPick}
          onMarkRead={() => updateItem(todaysPick.id, { status: "read" })}
          onDismiss={() => dismissPick(todaysPick.id)}
        />
      )}

      {/* Add form */}
      <section className="mb-8 rise">
        <form onSubmit={addItem} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
            disabled={loading}
            className="flex-1 bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-3 font-serif text-lg placeholder:text-muted/60 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="bg-oxblood text-paper px-6 py-3 font-mono text-xs tracking-[0.18em] uppercase hover:bg-ink transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Reading…" : "Save & summarize"}
          </button>
        </form>
        {error && <p className="mt-3 font-serif italic text-oxblood text-sm">{error}</p>}
      </section>

      {/* Search bar */}
      <section className="mb-8">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by concept, not just keyword…"
            className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none px-1 py-2 font-serif text-base placeholder:text-muted/50 transition-colors pr-8"
          />
          {searching && (
            <span className="absolute right-1 top-2 font-mono text-[10px] text-muted animate-pulse">…</span>
          )}
          {searchQuery && !searching && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-2 font-mono text-[10px] text-muted hover:text-ink transition-colors"
            >✕</button>
          )}
        </div>
      </section>

      {/* Active tag filters */}
      {tagFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted self-center">Filtering by:</span>
          {tagFilters.map((t) => (
            <button
              key={t}
              onClick={() => toggleTagFilter(t)}
              className="flex items-center gap-1 font-mono text-[10px] tracking-[0.12em] uppercase text-oxblood border border-oxblood px-2 py-0.5 hover:bg-oxblood hover:text-paper transition-colors"
            >
              {t} ✕
            </button>
          ))}
          <button
            onClick={() => setTagFilters([])}
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors"
          >clear all</button>
        </div>
      )}

      {/* Filter tabs — hidden during search */}
      {!isSearching && (
        <div className="flex flex-wrap gap-x-1 gap-y-1 mb-8 border-b border-rule pb-4">
          {TABS.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`font-mono text-[10px] tracking-[0.15em] uppercase px-3 py-1.5 transition-colors ${
                filter === key ? "bg-ink text-paper" : "text-muted hover:text-ink"
              }`}
            >
              {label} · {count}
            </button>
          ))}
        </div>
      )}

      {/* Search status line */}
      {isSearching && !searching && searchResults !== null && (
        <div className="mb-6 font-mono text-[10px] tracking-[0.15em] uppercase text-muted">
          {searchResults.length === 0
            ? "No results above 40% match"
            : `${searchResults.length} result${searchResults.length > 1 ? "s" : ""} · semantic search`}
        </div>
      )}

      {/* List */}
      {displayItems.length === 0 && !searching ? (
        <div className="text-center py-20 rise">
          <p className="font-serif italic text-ink/50 text-lg">
            {isSearching ? "Nothing found. Try different phrasing." : "Nothing here yet."}
          </p>
        </div>
      ) : (
        <ol className="space-y-12">
          {(displayItems as Array<ReadingItem & { similarity?: number }>).map((item) => (
            <Item
              key={item.id}
              item={item}
              similarity={item.similarity}
              onUpdate={updateItem}
              onRemove={removeItem}
              onTagClick={toggleTagFilter}
              activeTagFilters={tagFilters}
            />
          ))}
        </ol>
      )}

      <footer className="mt-20 pt-6 border-t border-rule font-mono text-[10px] tracking-[0.18em] uppercase text-muted text-center">
        {counts.all} {counts.all === 1 ? "entry" : "entries"} on the shelf
      </footer>
    </main>
  );
}
