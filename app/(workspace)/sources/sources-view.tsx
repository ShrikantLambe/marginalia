"use client";

import { useState, useEffect } from "react";
import type { Source, Brief } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

type BriefLite = Pick<Brief, "id" | "question" | "status">;
type Suggestion = { value: string; count: number };
type Violation = { url: string; query: string; created_at: string };

const CHROME = "font-mono text-[10px] tracking-[0.15em] uppercase text-muted";

function SourceRow({
  s, briefs, briefName, onSetBrief, onRemove,
}: {
  s: Source; briefs: BriefLite[];
  briefName: (id: string | null) => string | undefined;
  onSetBrief: (id: string, briefId: string | null) => void;
  onRemove: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="group/src flex items-start justify-between gap-3 py-2 border-b border-rule/60">
      <div className="min-w-0">
        <span className="font-serif text-[15px] text-ink">{s.value}</span>
        {s.type === "author" && (s.home_domains?.length ?? 0) > 0 && (
          <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
            {s.home_domains!.map((d) => (
              <span key={d} className="font-mono text-[9px] tracking-[0.08em] border border-rule text-muted px-1 py-px">
                {d}
              </span>
            ))}
          </span>
        )}
        {s.brief_id && briefName(s.brief_id) && (
          <div className="font-serif italic text-[12px] text-muted truncate">↳ {briefName(s.brief_id)}</div>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <label className="flex items-center gap-1.5">
          <span className="font-mono text-[9px] tracking-[0.15em] uppercase text-muted">Brief</span>
          <select
            value={s.brief_id ?? ""}
            onChange={(e) => onSetBrief(s.id, e.target.value || null)}
            className="bg-transparent border border-rule font-mono text-[10px] text-muted px-1 py-0.5 max-w-[140px]"
          >
            <option value="">All</option>
            {briefs.map((b) => (
              <option key={b.id} value={b.id}>{b.question.slice(0, 40)}</option>
            ))}
          </select>
        </label>
        {confirming ? (
          <span className="font-mono text-[10px] tracking-[0.08em] text-muted">
            Remove?{" "}
            <button onClick={() => onRemove(s.id)} className="text-oxblood hover:text-ink transition-colors">y</button>
            {" / "}
            <button onClick={() => setConfirming(false)} className="hover:text-ink transition-colors">n</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="opacity-0 group-hover/src:opacity-100 focus-visible:opacity-100 transition-opacity font-mono text-muted hover:text-oxblood text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </li>
  );
}

export function SourcesView({ briefs }: { briefs: BriefLite[] }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [suggestions, setSuggestions] = useState<{ domains: Suggestion[]; authors: Suggestion[] }>({ domains: [], authors: [] });
  const [violations, setViolations] = useState<Violation[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [domainInput, setDomainInput] = useState("");
  const [domainConfirm, setDomainConfirm] = useState<string | null>(null);
  const [authorInput, setAuthorInput] = useState("");
  const [authorDomains, setAuthorDomains] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setSources(data.sources ?? []);
        setSuggestions(data.suggestions ?? { domains: [], authors: [] });
        setViolations(data.violations ?? []);
      })
      .finally(() => setLoaded(true));
  }, []);

  async function addSource(payload: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Could not add source"); return null; }
    setSources((prev) => [...prev, data]);
    return data as Source;
  }

  function confirmDomain(e: React.FormEvent) {
    e.preventDefault();
    const raw = domainInput.trim();
    if (!raw) return;
    // Client-side preview of the normalization the server will apply
    try {
      const host = raw.includes("://") ? new URL(raw).hostname : raw.replace(/^www\./, "").split("/")[0];
      setDomainConfirm(host.replace(/^www\./, "").toLowerCase());
    } catch {
      setDomainConfirm(raw.toLowerCase());
    }
  }

  async function saveDomain() {
    if (!domainConfirm) return;
    const added = await addSource({ type: "domain", value: domainConfirm });
    if (added) { setDomainInput(""); setDomainConfirm(null); }
  }

  async function saveAuthor(e: React.FormEvent) {
    e.preventDefault();
    const name = authorInput.trim();
    if (!name) return;
    const home_domains = authorDomains.split(",").map((d) => d.trim()).filter(Boolean);
    const added = await addSource({ type: "author", value: name, home_domains });
    if (added) { setAuthorInput(""); setAuthorDomains(""); }
  }

  async function removeSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
  }

  async function setBrief(id: string, briefId: string | null) {
    const res = await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_id: briefId }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
  }

  const domains = sources.filter((s) => s.type === "domain");
  const authors = sources.filter((s) => s.type === "author");
  const briefName = (id: string | null) => briefs.find((b) => b.id === id)?.question;
  const BROAD_DOMAINS = ["medium.com", "substack.com", "linkedin.com"];
  const hasBroadDomain = domains.some((s) => BROAD_DOMAINS.includes(s.value));

  return (
    <main className="max-w-3xl px-8 md:px-14 py-10">
      <PageHeader title="Sources" caption="Add the sites and writers you trust. Discover will only look here." />

      {error && <p className="font-serif italic text-[13px] text-oxblood mb-4">{error}</p>}

      {/* Websites */}
      <section className="mb-12">
        <div className={`${CHROME} mb-3`}>Websites · {domains.length}</div>
        {domainConfirm ? (
          <div className="flex items-center gap-3 mb-4">
            <span className="font-serif text-[15px]">Adding: <span className="text-oxblood">{domainConfirm}</span> — correct?</span>
            <button onClick={saveDomain} className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink border border-rule px-2 py-1 hover:border-oxblood hover:text-oxblood transition-colors">Add</button>
            <button onClick={() => setDomainConfirm(null)} className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors">Cancel</button>
          </div>
        ) : (
          <form onSubmit={confirmDomain} className="mb-4">
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="ft.com or https://www.ft.com/…"
              className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none py-2 font-serif text-[15px] placeholder:text-muted/50 transition-colors"
            />
          </form>
        )}
        <ul>{domains.map((s) => <SourceRow key={s.id} s={s} briefs={briefs} briefName={briefName} onSetBrief={setBrief} onRemove={removeSource} />)}</ul>
        {hasBroadDomain && (
          <p className="font-serif italic text-[12px] text-muted/70 mt-2">
            Broad domain in your list — pair it with authors for sharper results.
          </p>
        )}
      </section>

      {/* Authors */}
      <section className="mb-12">
        <div className={`${CHROME} mb-3`}>Authors · {authors.length}</div>
        <form onSubmit={saveAuthor} className="mb-4 space-y-2">
          <input
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            placeholder="Author name"
            className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none py-2 font-serif text-[15px] placeholder:text-muted/50 transition-colors"
          />
          <input
            value={authorDomains}
            onChange={(e) => setAuthorDomains(e.target.value)}
            placeholder="Home domains, comma-separated (optional) — benn.substack.com, ft.com"
            className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none py-1.5 font-serif text-[13px] placeholder:text-muted/50 transition-colors"
          />
          {authorInput.trim() && (
            <button type="submit" className="font-mono text-[10px] tracking-[0.12em] uppercase text-ink border border-rule px-2 py-1 hover:border-oxblood hover:text-oxblood transition-colors">
              Add author
            </button>
          )}
        </form>
        <ul>{authors.map((s) => <SourceRow key={s.id} s={s} briefs={briefs} briefName={briefName} onSetBrief={setBrief} onRemove={removeSource} />)}</ul>
      </section>

      {/* From your library */}
      {loaded && (suggestions.domains.length > 0 || suggestions.authors.length > 0) && (
        <section className="mb-12">
          <div className={`${CHROME} mb-3`}>From your library</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {suggestions.domains.map((sug) => (
              <button
                key={`d-${sug.value}`}
                onClick={async () => {
                  const added = await addSource({ type: "domain", value: sug.value });
                  if (added) setSuggestions((prev) => ({ ...prev, domains: prev.domains.filter((x) => x.value !== sug.value) }));
                }}
                className="font-serif text-[13px] text-ink/80 hover:text-oxblood transition-colors"
              >
                + {sug.value} <span className="font-mono text-[10px] text-muted">·{sug.count}</span>
              </button>
            ))}
            {suggestions.authors.map((sug) => (
              <button
                key={`a-${sug.value}`}
                onClick={async () => {
                  const added = await addSource({ type: "author", value: sug.value });
                  if (added) setSuggestions((prev) => ({ ...prev, authors: prev.authors.filter((x) => x.value !== sug.value) }));
                }}
                className="font-serif italic text-[13px] text-ink/80 hover:text-oxblood transition-colors"
              >
                + {sug.value} <span className="font-mono text-[10px] text-muted not-italic">·{sug.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {loaded && sources.length === 0 && (
        <p className="font-serif italic text-muted text-[14px] mb-12">
          No sources yet. Start with a site you already trust.
        </p>
      )}

      {/* Guardrail log */}
      {violations.length > 0 && (
        <section className="pt-8 border-t border-rule">
          <div className={`${CHROME} mb-3`}>Guardrail log · {violations.length} dropped</div>
          <ul className="space-y-1">
            {violations.map((v, i) => (
              <li key={i} className="font-mono text-[11px] text-muted truncate">
                {new Date(v.created_at).toLocaleDateString()} · “{v.query}” → {v.url}
              </li>
            ))}
          </ul>
          <p className="font-serif italic text-[12px] text-muted/70 mt-2">
            Results the provider returned from outside your sources — dropped before you saw them.
          </p>
        </section>
      )}
    </main>
  );
}
