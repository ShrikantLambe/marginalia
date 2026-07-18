"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { CitedText, type Citation } from "@/app/components/CitedText";

type AskSource = Citation & { site_name: string | null };
type RecentQuestion = { id: string; question: string; created_at: string };

const CHROME = "font-mono text-[10px] tracking-[0.15em] uppercase text-muted";

/**
 * Ask mode of Find: a question → the most relevant saved articles → a streamed
 * answer that cites them inline. Runs on the shared input's submit (runSignal).
 */
export function AskPanel({
  query,
  runSignal,
  onRerun,
}: {
  query: string;
  runSignal: number;
  onRerun: (q: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "retrieving" | "answering" | "done" | "error">("idle");
  const [sources, setSources] = useState<AskSource[]>([]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentQuestion[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/ask")
      .then((r) => (r.ok ? r.json() : []))
      .then(setRecent)
      .catch(() => {});
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (runSignal === 0 || !query.trim()) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setPhase("retrieving");
      setAnswer("");
      setSources([]);
      setError(null);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: query.trim() }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Couldn't ask that."); setPhase("error"); return; }
        if (cancelled) return;
        setSources(data.sources ?? []);
        setRecent((prev) => [{ id: data.id, question: query.trim(), created_at: new Date().toISOString() }, ...prev].slice(0, 8));

        setPhase("answering");
        const stream = await fetch(`/api/ask/${data.id}/stream`, { method: "POST", signal: controller.signal });
        if (!stream.ok || !stream.body) { setError("Couldn't generate an answer."); setPhase("error"); return; }
        const reader = stream.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setAnswer((prev) => prev + decoder.decode(value, { stream: !done }));
        }
        if (!cancelled) setPhase("done");
      } catch {
        if (!cancelled) { /* aborted or network — leave whatever streamed */ }
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal]);

  // Empty state — recent questions
  if (phase === "idle") {
    return (
      <div>
        <p className="font-serif italic text-muted text-[15px] mb-6">
          Ask a question and get an answer drawn from your saved articles, with citations.
        </p>
        {recent.length > 0 && (
          <div>
            <div className={`${CHROME} mb-2`}>Recent questions</div>
            <ul className="space-y-1">
              {recent.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onRerun(r.question)}
                    className="font-serif text-[14px] text-ink/80 hover:text-oxblood transition-colors text-left"
                  >
                    {r.question}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  if (phase === "error") {
    return <p className="font-serif italic text-oxblood text-[15px]">{error}</p>;
  }

  return (
    <div>
      {/* Source cards */}
      {sources.length > 0 && (
        <div className="mb-6">
          <div className={`${CHROME} mb-2`}>
            {phase === "retrieving" ? "Reading your library…" : `From ${sources.length} of your articles`}
          </div>
          <ol className="space-y-1">
            {sources.map((s, i) => (
              <li key={s.id} className="flex gap-2">
                <span className="font-mono text-[10px] text-oxblood flex-shrink-0 mt-0.5">[{i + 1}]</span>
                <Link href={`/items/${s.id}`} className="group min-w-0">
                  <span className="font-serif text-[13px] text-ink/85 group-hover:text-oxblood transition-colors">
                    {s.title || "Untitled"}
                  </span>
                  {s.site_name && <span className="font-mono text-[9px] tracking-[0.12em] uppercase text-muted ml-2">{s.site_name}</span>}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      )}

      {phase === "retrieving" && (
        <div className={`${CHROME} animate-pulse`}>Finding relevant articles…</div>
      )}

      {/* Answer */}
      {(phase === "answering" || phase === "done") && (
        <div className="border-t border-rule pt-5">
          {answer ? (
            <CitedText
              text={answer}
              sources={sources}
              className="font-serif text-[17px] leading-relaxed text-ink/90"
            />
          ) : (
            <span className={`${CHROME} animate-pulse`}>Thinking…</span>
          )}
        </div>
      )}
    </div>
  );
}
