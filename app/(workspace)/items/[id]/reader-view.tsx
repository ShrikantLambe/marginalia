"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import type { ReadingItem, ArticleHighlight, ChatMessage } from "@/lib/supabase";
import type { RelatedItem } from "./page";
import { ChatPanel } from "./chat-panel";

type Status = "queued" | "reading" | "read" | "archived";
const STATUS_CYCLE: Status[] = ["queued", "reading", "read", "archived"];
const STATUS_LABELS: Record<Status, string> = {
  queued: "Queued",
  reading: "Reading",
  read: "Read",
  archived: "Archived",
};
function nextStatus(s: Status): Status {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
}

type Toolbar =
  | { visible: false }
  | { visible: true; x: number; y: number; text: string; noteMode: boolean };

function wrapFirstOccurrence(container: HTMLElement, text: string, hid: string) {
  if (!text.trim()) return;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const tn = node as Text;
    const idx = (tn.textContent ?? "").indexOf(text);
    if (idx === -1) continue;
    try {
      const range = document.createRange();
      range.setStart(tn, idx);
      range.setEnd(tn, idx + text.length);
      const mark = document.createElement("mark");
      mark.className = "marginalia-highlight";
      mark.dataset.hid = hid;
      range.surroundContents(mark);
    } catch {
      // range crosses element boundaries — skip
    }
    return;
  }
}

function clearHighlightMarks(container: HTMLElement) {
  container.querySelectorAll("mark.marginalia-highlight").forEach((el) => {
    const parent = el.parentNode!;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
  container.normalize();
}

// ── Star rating ───────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          onClick={() => onChange(value === n ? null : n)}
          className={`text-sm leading-none transition-colors ${
            (hover ?? value ?? 0) >= n ? "text-oxblood" : "text-rule"
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReaderView({
  item: initialItem,
  initialHighlights,
  related = [],
}: {
  item: ReadingItem;
  initialHighlights: ArticleHighlight[];
  related?: RelatedItem[];
}) {
  const [item, setItem] = useState(initialItem);
  const [highlights, setHighlights] = useState<ArticleHighlight[]>(initialHighlights);
  const [toolbar, setToolbar] = useState<Toolbar>({ visible: false });
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetchingArticle, setFetchingArticle] = useState(false);
  const [notesValue, setNotesValue] = useState(item.notes ?? "");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(null);
  const [pendingInsight, setPendingInsight] = useState<ChatMessage | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const articleHtmlSet = useRef(false);
  const insightFiredRef = useRef(false);

  const status = (item.status ?? "unread") as Status;

  // Set article HTML once on mount — uncontrolled so DOM marks are stable
  useEffect(() => {
    if (articleRef.current && item.article_html && !articleHtmlSet.current) {
      articleRef.current.innerHTML = item.article_html;
      articleHtmlSet.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-apply all highlight marks whenever highlights array changes
  useEffect(() => {
    const container = articleRef.current;
    if (!container || !item.article_html) return;
    clearHighlightMarks(container);
    for (const h of highlights) {
      wrapFirstOccurrence(container, h.text, h.id);
    }
  }, [highlights, item.article_html]);

  // Close toolbar on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setToolbar({ visible: false });
        setNoteText("");
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Text selection → toolbar ────────────────────────────────────────────────

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      setToolbar({ visible: false });
      return;
    }
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    if (!articleRef.current?.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setToolbar({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY - 8,
      text,
      noteMode: false,
    });
  }

  // ── Highlight creation ──────────────────────────────────────────────────────

  async function createHighlight(withNoteMode = false) {
    if (!toolbar.visible) return;

    if (withNoteMode && !toolbar.noteMode) {
      setToolbar({ ...toolbar, noteMode: true });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/items/${item.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: toolbar.text, note: noteText || null }),
      });
      if (res.ok) {
        const newH: ArticleHighlight = await res.json();
        setHighlights((prev) => [...prev, newH]);
        window.getSelection()?.removeAllRanges();
      }
    } finally {
      setSaving(false);
      setToolbar({ visible: false });
      setNoteText("");
    }
  }

  async function discussPassage() {
    if (!toolbar.visible) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${item.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: toolbar.text, note: null }),
      });
      if (res.ok) {
        const newH: ArticleHighlight = await res.json();
        setHighlights((prev) => [...prev, newH]);
        window.getSelection()?.removeAllRanges();
        setActiveHighlightId(newH.id);
        setChatOpen(true);
      }
    } finally {
      setSaving(false);
      setToolbar({ visible: false });
      setNoteText("");
    }
  }

  // ── Reading progress beacons ────────────────────────────────────────────────
  // Extends the existing open beacon: last_opened_at on mount, then
  // scroll_progress at 25/50/75/100% thresholds (fire-and-forget — progress
  // tracking must never block or error the reading experience).

  const sentThresholds = useRef(new Set<number>());

  useEffect(() => {
    fetch(`/api/items/${item.id}/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }).catch(() => {});
  }, [item.id]);

  useEffect(() => {
    if (!item.article_html) return;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return;
        const pct = (window.scrollY / docHeight) * 100;
        for (const threshold of [25, 50, 75, 100]) {
          if (pct >= threshold && !sentThresholds.current.has(threshold)) {
            sentThresholds.current.add(threshold);
            fetch(`/api/items/${item.id}/open`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ progress: threshold }),
            }).catch(() => {});
          }
        }
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [item.article_html, item.id]);

  // Restore approximate position when resuming a half-read article
  useEffect(() => {
    if (!item.article_html) return;
    const progress = item.scroll_progress ?? 0;
    if (progress >= 25 && progress <= 99) {
      const timer = setTimeout(() => {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight > 0) window.scrollTo({ top: (progress / 100) * docHeight });
        // Don't re-fire beacons for ground already covered
        for (const t of [25, 50, 75]) if (progress >= t) sentThresholds.current.add(t);
      }, 150);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reading-behavior insight ────────────────────────────────────────────────
  // Fires at most once per page view: reader has stopped scrolling for a while
  // mid-article (not just landed, not already at the end).

  useEffect(() => {
    if (!item.article_text) return;
    let lastY = window.scrollY;
    let lastMoveAt = Date.now();
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - lastY) > 40) {
          lastY = y;
          lastMoveAt = Date.now();
        }
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    const interval = setInterval(async () => {
      if (insightFiredRef.current) return;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollDepthPct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      const stallMs = Date.now() - lastMoveAt;
      if (stallMs >= 25_000 && scrollDepthPct >= 15 && scrollDepthPct <= 95) {
        insightFiredRef.current = true;
        const res = await fetch(`/api/items/${item.id}/insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextNote: `${Math.round(stallMs / 1000)}s dwell · ${Math.round(scrollDepthPct)}% scroll depth`,
          }),
        });
        if (res.ok) {
          setPendingInsight(await res.json());
          setChatOpen(true);
        }
      }
    }, 3_000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      clearInterval(interval);
    };
  }, [item.article_text, item.id]);

  async function deleteHighlight(hid: string) {
    // Optimistic remove from DOM first for snappiness
    const container = articleRef.current;
    if (container) {
      const mark = container.querySelector(`mark.marginalia-highlight[data-hid="${hid}"]`);
      if (mark) {
        const parent = mark.parentNode!;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        parent.normalize();
      }
    }
    setHighlights((prev) => prev.filter((h) => h.id !== hid));
    await fetch(`/api/items/${item.id}/highlights/${hid}`, { method: "DELETE" });
  }

  // ── Item updates ────────────────────────────────────────────────────────────

  async function patchItem(updates: Record<string, unknown>) {
    const res = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (res.ok) setItem(await res.json());
  }

  async function saveNotes() {
    if (notesValue === (item.notes ?? "")) return;
    await patchItem({ notes: notesValue || null });
  }

  async function cycleStatus() {
    await patchItem({ status: nextStatus(status) });
  }

  async function fetchArticle() {
    setFetchingArticle(true);
    try {
      const res = await fetch(`/api/items/${item.id}/fetch-article`, { method: "POST" });
      if (res.ok) window.location.reload();
    } finally {
      setFetchingArticle(false);
    }
  }

  function hostname(url: string) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }

  function extractYouTubeId(url: string): string | null {
    try {
      const u = new URL(url);
      if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0];
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    } catch { /* ignore */ }
    return null;
  }

  const youtubeId = extractYouTubeId(item.url);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen relative">
      {/* ── Article column ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        {/* Back nav */}
        <div className="px-8 md:px-14 pt-6 pb-2">
          <Link
            href="/dashboard"
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors"
          >
            ← Back
          </Link>
        </div>

        {/* Hero image — hidden for YouTube (player replaces it) */}
        {item.hero_image_url && !youtubeId && (
          <div className="mb-8">
            <img
              src={item.hero_image_url}
              alt=""
              className="w-full max-h-72 object-cover"
            />
          </div>
        )}

        <div className="px-8 md:px-14 pb-20 max-w-3xl">
          {/* Title */}
          <h1 className="font-serif text-[32px] md:text-[38px] font-semibold leading-tight mb-4">
            {item.title || item.url}
          </h1>

          {/* Byline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-10 border-b border-rule pb-6">
            {item.author && <span>{item.author}</span>}
            {item.site_name ? (
              <span>{item.site_name}</span>
            ) : (
              <span>{hostname(item.url)}</span>
            )}
            {item.reading_time_minutes && (
              <span>{item.reading_time_minutes} min read</span>
            )}
            {item.word_count && (
              <span>{item.word_count.toLocaleString()} words</span>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-oxblood transition-colors"
            >
              Original ↗
            </a>
          </div>

          {/* Article body / YouTube player */}
          {youtubeId ? (
            <div className="w-full aspect-video mb-10">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}`}
                title={item.title ?? "YouTube video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
              />
            </div>
          ) : item.article_html ? (
            <div
              ref={articleRef}
              className="article-body"
              onMouseUp={handleMouseUp}
            />
          ) : (
            <div className="text-center py-16">
              <p className="font-serif italic text-muted mb-4">
                Article content not yet fetched.
              </p>
              <button
                onClick={fetchArticle}
                disabled={fetchingArticle}
                className="border border-oxblood text-oxblood px-4 py-2 font-mono text-[10px] tracking-[0.15em] uppercase hover:bg-oxblood hover:text-paper transition-colors disabled:opacity-40"
              >
                {fetchingArticle ? "Fetching…" : "Fetch Article"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Marginalia right pane ─────────────────────────────────────── */}
      <div className="hidden xl:flex flex-col w-[300px] flex-shrink-0 border-l border-rule sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Status + rating */}
          <div className="flex items-center justify-between">
            <button
              onClick={cycleStatus}
              className={`font-mono text-[10px] px-2 py-0.5 border transition-colors ${
                status === "reading"
                  ? "border-oxblood text-oxblood"
                  : status === "read"
                  ? "border-sage text-sage"
                  : status === "archived"
                  ? "border-rule text-muted"
                  : "border-rule text-muted hover:border-ink hover:text-ink"
              }`}
            >
              {STATUS_LABELS[status]}
            </button>
            <StarRating
              value={item.rating}
              onChange={(n) => patchItem({ rating: n })}
            />
          </div>

          {/* TL;DR */}
          {item.summary && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">
                TL;DR
              </div>
              <p className="summary font-serif text-[15px] leading-relaxed text-ink/85">
                {item.summary}
              </p>
            </div>
          )}

          {/* Editorial note */}
          {item.editorial_note && (
            <div className="flex gap-3">
              <div className="w-px bg-oxblood/60 flex-shrink-0" />
              <p className="font-serif italic text-[13px] leading-relaxed text-ink/70">
                {item.editorial_note}
              </p>
            </div>
          )}

          {/* Tags */}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.12em] uppercase text-sage">
              {item.tags.map((t) => (
                <span key={t}>· {t}</span>
              ))}
            </div>
          )}

          {/* Notes */}
          <div>
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">
              Notes
            </div>
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              onBlur={saveNotes}
              placeholder="Your thoughts…"
              rows={4}
              className="w-full bg-transparent border border-rule focus:border-oxblood outline-none px-3 py-2 font-serif text-[14px] text-ink placeholder:text-muted/50 resize-y transition-colors"
            />
          </div>

          {/* Highlights list */}
          {highlights.length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-3">
                Highlights · {highlights.length}
              </div>
              <ul className="space-y-4">
                {highlights.map((h) => (
                  <li key={h.id} className="group/hl">
                    <div className="flex items-start gap-2">
                      <div className="w-[2px] bg-oxblood/60 flex-shrink-0 self-stretch mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-serif italic text-[13px] text-ink/80 leading-snug">
                          {h.text}
                        </p>
                        {h.note && (
                          <p className="mt-1 font-serif text-[12px] text-muted leading-snug">
                            {h.note}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteHighlight(h.id)}
                        className="opacity-0 group-hover/hl:opacity-100 transition-opacity text-muted hover:text-oxblood text-xs flex-shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Related in your library — embedding neighbours */}
          {related.length > 0 && (
            <div>
              <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-3">
                Related in your library
              </div>
              <ul className="space-y-3">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/items/${r.id}`} className="group block">
                      <p className="font-serif text-[13px] leading-snug text-ink/85 group-hover:text-oxblood transition-colors">
                        {r.title || r.url}
                      </p>
                      <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted">
                        {r.site_name || hostname(r.url)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating highlight toolbar ────────────────────────────────── */}
      {toolbar.visible && (
        <div
          ref={toolbarRef}
          style={{
            position: "absolute",
            left: toolbar.x,
            top: toolbar.y,
            transform: "translate(-50%, -100%)",
            zIndex: 50,
          }}
          className="bg-ink text-paper shadow-lg"
        >
          {toolbar.noteMode ? (
            <div className="px-3 py-2 flex flex-col gap-2 min-w-[180px]">
              <input
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createHighlight(true);
                  if (e.key === "Escape") {
                    setToolbar({ visible: false });
                    setNoteText("");
                  }
                }}
                placeholder="Add note…"
                className="bg-transparent border-b border-paper/30 outline-none py-1 font-serif text-[13px] text-paper placeholder:text-paper/50 w-full"
              />
              <div className="flex gap-3 justify-end font-mono text-[10px] tracking-[0.12em] uppercase">
                <button
                  onClick={() => createHighlight(true)}
                  disabled={saving}
                  className="hover:text-oxblood/80 transition-colors disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setToolbar({ visible: false });
                    setNoteText("");
                  }}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                >
                  ✕
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 flex gap-3 font-mono text-[10px] tracking-[0.12em] uppercase">
              <button
                onClick={() => createHighlight(false)}
                disabled={saving}
                className="hover:text-oxblood/80 transition-colors disabled:opacity-40"
              >
                Highlight
              </button>
              <span className="opacity-30">|</span>
              <button
                onClick={() => createHighlight(true)}
                disabled={saving}
                className="hover:text-oxblood/80 transition-colors disabled:opacity-40"
              >
                + Note
              </button>
              <span className="opacity-30">|</span>
              <button
                onClick={discussPassage}
                disabled={saving}
                className="hover:text-oxblood/80 transition-colors disabled:opacity-40"
              >
                Discuss
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── AI chat panel ────────────────────────────────────────────── */}
      <ChatPanel
        itemId={item.id}
        highlights={highlights}
        open={chatOpen}
        onOpenChange={setChatOpen}
        activeHighlightId={activeHighlightId}
        onActiveHighlightChange={setActiveHighlightId}
        pendingInsight={pendingInsight}
      />
    </div>
  );
}
