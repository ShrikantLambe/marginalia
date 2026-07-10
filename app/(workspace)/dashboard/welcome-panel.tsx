"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { WelcomeState, WelcomeSuggestion } from "@/lib/welcome";

function greetingFor(date: Date): string {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Working late";
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function WelcomePanel({ userName }: { userName: string }) {
  const [state, setState] = useState<WelcomeState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [greeting, setGreeting] = useState<string>("");
  const [hiddenAt, setHiddenAt] = useState(Date.now());

  useEffect(() => {
    if (sessionStorage.getItem("welcome-dismissed") === "1") { setDismissed(true); return; }
    setGreeting(greetingFor(new Date()));
    fetch("/api/welcome-state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setState(data); })
      .catch(() => {});
  }, []);

  // Recompute the greeting when the tab regains focus after 30+ minutes —
  // an overnight tab must not say "Good evening" at 9am
  const onVisibility = useCallback(() => {
    if (document.visibilityState === "hidden") {
      setHiddenAt(Date.now());
    } else if (Date.now() - hiddenAt > 30 * 60_000) {
      setGreeting(greetingFor(new Date()));
    }
  }, [hiddenAt]);

  useEffect(() => {
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onVisibility]);

  if (dismissed || !state || !state.shouldShowWelcome) return null;

  function dismiss() {
    sessionStorage.setItem("welcome-dismissed", "1");
    setDismissed(true);
  }

  function cardFor(s: WelcomeSuggestion) {
    switch (s.type) {
      case "resume_reading":
        return (
          <Link href={`/items/${s.itemId}`} className="block font-serif text-[14px] text-ink/85 hover:text-oxblood transition-colors">
            Continue reading <em>{s.title}</em> — {s.progressPct}% through
          </Link>
        );
      case "resume_draft":
        return (
          <Link href={`/synthesis/${s.id}`} className="block font-serif text-[14px] text-ink/85 hover:text-oxblood transition-colors">
            Pick up your draft: <em>{s.title}</em>
          </Link>
        );
      case "resume_search":
        return (
          <Link href={`/discover?q=${encodeURIComponent(s.query)}&run=1`} className="block font-serif text-[14px] text-ink/85 hover:text-oxblood transition-colors">
            Re-run “{s.query}” on Discover
          </Link>
        );
      case "review_unread":
        return (
          <Link href="/dashboard" className="block font-serif text-[14px] text-ink/85 hover:text-oxblood transition-colors">
            {s.count} unread items waiting
          </Link>
        );
    }
  }

  return (
    <div className="mb-4 pb-4 border-b border-rule animate-[fadeIn_0.4s_ease-out]">
      <div className="flex items-baseline justify-between">
        <p className="font-serif text-[16px] text-ink">
          {greeting}, {userName}.
          {state.lastSeenAt && (
            <span className="font-serif italic text-[13px] text-muted ml-2">
              Last here {relativeTime(state.lastSeenAt)}.
            </span>
          )}
        </p>
        <button onClick={dismiss} className="text-muted hover:text-ink text-xs transition-colors" title="Dismiss">
          ✕
        </button>
      </div>
      {state.suggestions.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {state.suggestions.map((s, i) => (
            <li key={i} className="flex gap-3">
              <div className="w-px bg-oxblood/40 flex-shrink-0" />
              {cardFor(s)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
