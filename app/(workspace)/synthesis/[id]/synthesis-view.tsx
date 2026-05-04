"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Synthesis } from "@/lib/supabase";

export function SynthesisView({
  synthesis,
}: {
  synthesis: Synthesis;
}) {
  const [draft, setDraft] = useState(synthesis.draft);
  const [streaming, setStreaming] = useState(!synthesis.draft);
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [draft]);

  // Stream if draft is empty
  useEffect(() => {
    if (synthesis.draft) return;

    const controller = new AbortController();
    setStreaming(true);

    fetch(`/api/synthesize/${synthesis.id}/stream`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          setDraft((prev) => prev + decoder.decode(value, { stream: !done }));
        }
      })
      .catch(() => {})
      .finally(() => setStreaming(false));

    return () => controller.abort();
  }, [synthesis.id, synthesis.draft]);

  // Debounced save on edit
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      setSaved(false);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        await fetch(`/api/synthesize/${synthesis.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft: e.target.value }),
        });
        setSaved(true);
      }, 1000);
    },
    [synthesis.id]
  );

  function copyToClipboard() {
    navigator.clipboard.writeText(draft);
  }

  function exportMarkdown() {
    const title = synthesis.title ?? "synthesis";
    const blob = new Blob([draft], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.slice(0, 50).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const title =
    synthesis.title ??
    draft.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "") ??
    "Untitled synthesis";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-rule pb-6 mb-10">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
            <a href="/dashboard" className="hover:text-ink transition-colors">← Dashboard</a>
            &nbsp;·&nbsp;
            <a href="/synthesis" className="hover:text-ink transition-colors">Past Drafts</a>
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-semibold leading-tight tracking-tight line-clamp-2">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {!streaming && draft && (
            <>
              <button
                onClick={copyToClipboard}
                className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors"
              >
                Copy
              </button>
              <button
                onClick={exportMarkdown}
                className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted hover:text-ink transition-colors"
              >
                Export
              </button>
            </>
          )}
          {saved && (
            <span className="font-mono text-[10px] tracking-[0.15em] uppercase text-sage">Saved</span>
          )}
        </div>
      </header>

      {/* Source articles */}
      {synthesis.prompt && (
        <p className="font-serif italic text-ink/60 text-base mb-6">
          Focus: {synthesis.prompt}
        </p>
      )}

      {/* Draft */}
      {streaming && !draft && (
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted animate-pulse mb-6">
          Generating draft…
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        disabled={streaming}
        placeholder={streaming ? "" : "Draft will appear here…"}
        className="w-full bg-transparent outline-none font-serif text-lg leading-relaxed text-ink resize-none placeholder:text-muted/40 disabled:cursor-default"
        style={{ minHeight: "60vh" }}
      />
    </main>
  );
}
