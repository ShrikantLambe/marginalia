"use client";

import { useState, useEffect, useRef } from "react";

type State = "idle" | "saving" | "saved" | "duplicate" | "error";

export function QuickSaveModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<State>("idle");
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when modal opens; reset state when it closes
  useEffect(() => {
    if (open) {
      setState("idle");
      setUrl("");
      setSavedTitle(null);
      setErrorMsg(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Auto-close on success
  useEffect(() => {
    if (state === "saved" || state === "duplicate") {
      const t = setTimeout(onClose, 1200);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  // Close on Escape (global)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

      {/* Card */}
      <div className="relative bg-paper border border-rule w-full max-w-[440px] mx-4 px-8 py-8">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 font-mono text-[11px] text-muted hover:text-ink transition-colors"
        >
          ✕
        </button>

        {/* Header */}
        <p className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-6">
          Add to Marginalia
        </p>

        {/* Success */}
        {state === "saved" && (
          <div className="flex items-start gap-3">
            <span className="text-sage font-mono text-[11px] mt-1 flex-shrink-0">✓</span>
            <p className="font-serif italic text-[20px] leading-snug">{savedTitle}</p>
          </div>
        )}

        {/* Duplicate */}
        {state === "duplicate" && (
          <p className="font-serif italic text-[18px] text-muted">
            Already on your shelf.
          </p>
        )}

        {/* Form */}
        {(state === "idle" || state === "saving" || state === "error") && (
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onPaste={handlePaste}
                placeholder="https://…"
                disabled={state === "saving"}
                className="flex-1 bg-transparent border-b-2 border-rule focus:border-oxblood outline-none py-2 font-serif italic text-[20px] placeholder:text-muted/50 transition-colors disabled:opacity-50"
              />
              <span className="font-mono text-[10px] text-muted/50 flex-shrink-0">↵</span>
            </div>
            {state === "saving" && (
              <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted mt-3 animate-pulse">
                Saving…
              </p>
            )}
            {state === "error" && errorMsg && (
              <p className="font-serif italic text-oxblood text-[14px] mt-2">{errorMsg}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
