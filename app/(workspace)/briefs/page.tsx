"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Brief } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  drafting: "Drafting",
  closed: "Closed",
  archived: "Archived",
};

export default function BriefsPage() {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"open" | "all">("open");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/briefs?status=${statusFilter}`)
      .then(r => r.json())
      .then(data => { setBriefs(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [statusFilter]);

  async function createBrief(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setCreating(true); setError(null);
    try {
      const res = await fetch("/api/briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create brief"); return; }
      router.push(`/briefs/${data.id}`);
    } catch { setError("Something went wrong."); }
    finally { setCreating(false); }
  }

  return (
    <div className="max-w-3xl px-8 md:px-14 py-10">
      <PageHeader title="Briefs" caption="Reading with intent — what are you reading toward?" />

      {/* Create input */}
      <form onSubmit={createBrief} className="mb-10">
        <input
          ref={inputRef}
          type="text"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="What are you reading toward?"
          disabled={creating}
          className="w-full bg-transparent border-b-2 border-rule focus:border-oxblood outline-none px-0 py-3 font-serif italic text-[20px] placeholder:text-muted/50 transition-colors disabled:opacity-50"
        />
        {error && <p className="font-serif italic text-oxblood text-[14px] mt-2">{error}</p>}
        {question.trim() && (
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mt-2">
            Press enter to create
          </p>
        )}
      </form>

      {/* Status filter */}
      <div className="flex items-center gap-4 mb-6 font-mono text-[10px] tracking-[0.15em] uppercase">
        {(["open", "all"] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`transition-colors ${
              statusFilter === s ? "text-ink border-b border-ink" : "text-muted hover:text-ink"
            }`}
          >
            {s === "open" ? "Open" : "All"}
          </button>
        ))}
      </div>

      {/* Briefs list */}
      {loading ? (
        <p className="font-serif italic text-muted text-[16px]">Loading…</p>
      ) : briefs.length === 0 ? (
        <div>
          <p className="font-serif italic text-muted text-[16px] leading-relaxed mb-3">
            {statusFilter === "open"
              ? "No open briefs. What are you reading toward?"
              : "No briefs yet."}
          </p>
          {statusFilter === "open" && (
            <button
              onClick={() => {
                setQuestion("Why do data platforms fail after the pilot?");
                inputRef.current?.focus();
              }}
              className="font-serif italic text-[15px] text-muted/60 hover:text-oxblood transition-colors text-left"
            >
              e.g. — Why do data platforms fail after the pilot?
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-0">
          {briefs.map((brief, i) => (
            <li key={brief.id}>
              {i > 0 && <hr className="border-rule" />}
              <Link
                href={`/briefs/${brief.id}`}
                className="block py-6 group"
              >
                <p className="font-serif italic text-[24px] leading-tight mb-3 group-hover:text-oxblood transition-colors">
                  {brief.question}
                </p>
                {brief.description && (
                  <p className="font-serif text-[15px] text-ink/70 leading-relaxed mb-3">
                    {brief.description}
                  </p>
                )}
                <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
                  <span>{brief.item_count ?? 0} {(brief.item_count ?? 0) === 1 ? "article" : "articles"}</span>
                  <span>·</span>
                  <span>{formatDate(brief.created_at)}</span>
                  <span>·</span>
                  <span className={brief.status !== "open" ? "text-muted" : "text-sage"}>
                    {STATUS_LABELS[brief.status]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
