"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

type State = "idle" | "saving" | "saved" | "duplicate" | "error";

export function QuickSaveForm({
  initialUrl = "",
  isPopup = false,
}: {
  initialUrl?: string;
  isPopup?: boolean;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [state, setState] = useState<State>("idle");
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const didAutoSave = useRef(false);

  // Auto-save on mount if URL was provided
  useEffect(() => {
    if (initialUrl && !didAutoSave.current) {
      didAutoSave.current = true;
      save(initialUrl);
    } else if (!initialUrl) {
      inputRef.current?.focus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-close popup after success/duplicate
  useEffect(() => {
    if ((state === "saved" || state === "duplicate") && isPopup) {
      const t = setTimeout(() => window.close(), 1500);
      return () => clearTimeout(t);
    }
  }, [state, isPopup]);

  async function save(target: string) {
    const trimmed = target.trim();
    if (!trimmed) { inputRef.current?.focus(); return; }
    try { new URL(trimmed); } catch {
      setState("error");
      setErrorMsg("That doesn't look like a valid URL.");
      return;
    }
    setState("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (res.status === 409) { setState("duplicate"); return; }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSavedTitle(data.title ?? trimmed);
      setState("saved");
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").trim();
    try {
      new URL(pasted);
      e.preventDefault();
      setUrl(pasted);
      save(pasted);
    } catch { /* not a URL */ }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    save(url);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-6">
      <div className="w-full max-w-[440px]">
        {/* Wordmark */}
        <div className="mb-10">
          <p className="font-serif text-[22px] font-semibold">
            Marg<span className="text-oxblood">i</span>nalia
          </p>
          <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mt-0.5">
            Save to your list
          </p>
        </div>

        {/* States */}
        {state === "saved" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-sage font-mono text-[11px] mt-0.5">✓</span>
              <p className="font-serif italic text-[20px] leading-snug text-ink">
                {savedTitle}
              </p>
            </div>
            {isPopup ? (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
                Closing…
              </p>
            ) : (
              <Link
                href="/dashboard"
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors block"
              >
                ← back to your list
              </Link>
            )}
          </div>
        )}

        {state === "duplicate" && (
          <div className="space-y-4">
            <p className="font-serif italic text-[18px] text-muted">
              Already on your shelf.
            </p>
            {isPopup ? (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
                Closing…
              </p>
            ) : (
              <Link
                href="/dashboard"
                className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted hover:text-ink transition-colors block"
              >
                ← back to your list
              </Link>
            )}
          </div>
        )}

        {(state === "idle" || state === "saving" || state === "error") && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={e => { if (e.key === "Escape") { setUrl(""); setState("idle"); } }}
                placeholder="https://…"
                disabled={state === "saving"}
                className="flex-1 bg-transparent border-b-2 border-rule focus:border-oxblood outline-none py-2 font-serif italic text-[20px] placeholder:text-muted/50 transition-colors disabled:opacity-50"
              />
              <span className="font-mono text-[10px] text-muted/50 flex-shrink-0">↵</span>
            </div>
            {state === "saving" && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted animate-pulse">
                Saving…
              </p>
            )}
            {state === "error" && errorMsg && (
              <p className="font-serif italic text-oxblood text-[14px]">{errorMsg}</p>
            )}
            {state === "idle" && !isPopup && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted">
                Paste a URL or type one above
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
