"use client";

import { useState } from "react";
import { useUser, UserButton } from "@stackframe/stack";
import type { ReadingItem } from "@/lib/supabase";

export function ReadingList({
  initialItems,
  userName,
}: {
  initialItems: ReadingItem[];
  userName: string;
}) {
  const user = useUser();
  const [items, setItems] = useState<ReadingItem[]>(initialItems);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    await fetch(`/api/items/${id}`, { method: "DELETE" });
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-rule pb-6 mb-10">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
            The Reading Room
          </div>
          <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight">
            Marg<span className="text-oxblood">i</span>nalia
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-serif italic text-ink/60 text-sm hidden sm:inline">
            for {userName}
          </span>
          {user ? <UserButton /> : null}
        </div>
      </header>

      {/* Add form */}
      <section className="mb-12 rise">
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
        {error && (
          <p className="mt-3 font-serif italic text-oxblood text-sm">
            {error}
          </p>
        )}
      </section>

      {/* List */}
      {items.length === 0 ? (
        <div className="text-center py-20 rise">
          <p className="font-serif italic text-ink/50 text-lg">
            Your shelf is empty. Paste a link above to start.
          </p>
        </div>
      ) : (
        <ol className="space-y-12">
          {items.map((item, idx) => (
            <li
              key={item.id}
              className="rise group"
              style={{ animationDelay: `${Math.min(idx * 0.05, 0.4)}s` }}
            >
              <article className="border-b border-rule pb-10">
                {/* Metadata line */}
                <div className="flex items-center justify-between mb-3 font-mono text-[10px] tracking-[0.18em] uppercase text-muted">
                  <span>
                    №&nbsp;{String(items.length - idx).padStart(3, "0")}
                    &nbsp;·&nbsp;
                    {hostname(item.url)}
                    &nbsp;·&nbsp;
                    {formatDate(item.created_at)}
                  </span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-oxblood"
                    aria-label="Remove from list"
                  >
                    Remove
                  </button>
                </div>

                {/* Title */}
                <h2 className="font-serif text-2xl md:text-3xl font-semibold leading-tight mb-4">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-underline"
                  >
                    {item.title || item.url}
                  </a>
                </h2>

                {/* Summary with drop cap */}
                {item.summary && (
                  <p className="summary font-serif text-lg leading-relaxed text-ink/85 mb-4">
                    {item.summary}
                  </p>
                )}

                {/* Tags */}
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.15em] uppercase text-sage">
                    {item.tags.map((t) => (
                      <span key={t}>· {t}</span>
                    ))}
                  </div>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-20 pt-6 border-t border-rule font-mono text-[10px] tracking-[0.18em] uppercase text-muted text-center">
        {items.length} {items.length === 1 ? "entry" : "entries"} on the shelf
      </footer>
    </main>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
