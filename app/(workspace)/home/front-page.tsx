"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { HomeState } from "@/lib/home";
import type { TopicFeed } from "@/lib/tags";
import { TopicRail } from "./topic-rail";

type Edition = "morning" | "afternoon" | "evening" | "late";

function editionFor(date: Date): Edition {
  const h = date.getHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "late";
}

const EDITION_LABEL: Record<Edition, string> = {
  morning: "Morning Edition",
  afternoon: "Afternoon Edition",
  evening: "Evening Edition",
  late: "Late Edition",
};

function greetingFor(edition: Edition, name: string | null): string {
  switch (edition) {
    case "morning": return name ? `Good morning, ${name}.` : "Good morning.";
    case "afternoon": return name ? `Good afternoon, ${name}.` : "Good afternoon.";
    case "evening": return name ? `Good evening, ${name}.` : "Good evening.";
    case "late": return name ? `Up late, ${name}?` : "Up late?";
  }
}

function looksLikeUrl(text: string): boolean {
  if (/^https?:\/\//i.test(text)) return true;
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text);
}

const MONO = "font-mono tracking-[0.15em] uppercase";

export function FrontPage({ firstName, topics }: { firstName: string | null; topics: TopicFeed[] }) {
  const router = useRouter();
  const [clock, setClock] = useState<Date>(() => new Date());
  const [state, setState] = useState<HomeState | null>(null);
  const [input, setInput] = useState("");
  const [searchTarget, setSearchTarget] = useState<"library" | "discover">("library");
  const [capturing, setCapturing] = useState(false);
  const [captured, setCaptured] = useState<{ id: string; title: string | null } | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hiddenAtRef = useRef(Date.now());

  const edition = editionFor(clock);

  useEffect(() => {
    fetch("/api/home-state")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setState(data); })
      .catch(() => {});
    try {
      const stored = localStorage.getItem("omnibox-target");
      if (stored === "discover") setSearchTarget("discover");
    } catch { /* ignore */ }
  }, []);

  // Masthead edition + headline recompute together on tab refocus after 30+ min —
  // an overnight tab never greets the evening at 9am (promoted from the old panel)
  const onVisibility = useCallback(() => {
    if (document.visibilityState === "hidden") {
      hiddenAtRef.current = Date.now();
    } else if (Date.now() - hiddenAtRef.current > 30 * 60_000) {
      setClock(new Date());
    }
  }, []);
  useEffect(() => {
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [onVisibility]);

  // "/" focuses the omnibox; Esc (empty input) opens the inbox
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inField = document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
      if (e.key === "/" && !inField) {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape" && !input.trim()) {
        router.push("/dashboard");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [input, router]);

  function setTarget(t: "library" | "discover") {
    setSearchTarget(t);
    try { localStorage.setItem("omnibox-target", t); } catch { /* ignore */ }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setCaptureError(null);

    if (looksLikeUrl(text)) {
      setCapturing(true);
      setCaptured(null);
      try {
        const res = await fetch("/api/items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: /^https?:\/\//i.test(text) ? text : `https://${text}` }),
        });
        const data = await res.json();
        if (res.status === 409 && data.item) {
          setCaptured({ id: data.item.id, title: data.item.title });
          setCaptureError("Already on your shelf —");
        } else if (!res.ok) {
          setCaptureError(data.error ?? "Capture failed.");
        } else {
          setCaptured({ id: data.id, title: data.title });
        }
        setInput("");
      } finally {
        setCapturing(false);
      }
      return;
    }

    // The front page is the door — Find shows results
    const q = encodeURIComponent(text);
    router.push(
      searchTarget === "discover"
        ? `/find?mode=web&q=${q}&run=1`
        : `/find?mode=library&q=${q}`
    );
  }

  const dateline = clock
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase()
    .replace(",", " ·");

  const lede = state?.lede ?? null;
  const standfirst = state?.standfirst ?? null;
  const quiet = state?.quiet ?? null;
  const firstRun = state !== null && !lede && !quiet;

  return (
    <div className="flex gap-12 px-6 md:px-14 max-w-6xl">
    <main className="flex-1 min-w-0 max-w-3xl pt-10 pb-24 min-h-screen flex flex-col">
      {/* ── MASTHEAD ── */}
      <div className="border-t-2 border-b border-ink py-2 mb-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <span className={`${MONO} text-[11px] text-ink`}>Marginalia</span>
          {/* Browser clock differs from the server's at SSR — patch, don't warn */}
          <span suppressHydrationWarning className={`${MONO} text-[10px] text-muted sm:order-none order-last`}>
            {dateline} · {EDITION_LABEL[edition]}
          </span>
          {standfirst && standfirst.queueCount > 0 ? (
            <Link href="/dashboard" className={`${MONO} text-[10px] text-muted hover:text-oxblood transition-colors`}>
              Queue · {standfirst.queueCount}
            </Link>
          ) : (
            <span className={`${MONO} text-[10px] text-transparent select-none hidden sm:inline`}>·</span>
          )}
        </div>
      </div>

      {/* ── HEADLINE ── */}
      <h1 suppressHydrationWarning className="font-serif text-[34px] md:text-[46px] font-semibold leading-tight tracking-tight mb-8">
        {edition === "late" ? (
          firstName ? <>Up late, <span className="text-oxblood">{firstName}</span>?</> : <>Up late?</>
        ) : (
          <>{greetingFor(edition, null).replace(".", "")}{firstName ? <>, <span className="text-oxblood">{firstName}</span></> : null}.</>
        )}
      </h1>

      {/* ── OMNIBOX ── */}
      <form onSubmit={submit} className="mb-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a URL, or search your sources…"
          disabled={capturing}
          className="w-full bg-transparent border-b border-rule focus:border-oxblood outline-none py-3 font-serif italic text-[18px] placeholder:text-muted/50 transition-colors disabled:opacity-50"
        />
      </form>
      <div className="flex items-center justify-between mb-12">
        <span className="font-serif italic text-[13px] text-muted min-h-[1.25rem]">
          {capturing && "Capturing…"}
          {captureError && captured && (
            <>{captureError} <Link href={`/items/${captured.id}`} className="text-oxblood link-underline">open it →</Link></>
          )}
          {captureError && !captured && <span className="text-oxblood">{captureError}</span>}
          {!captureError && captured && (
            <>Captured — <Link href={`/items/${captured.id}`} className="text-oxblood link-underline">{captured.title ? `“${captured.title.slice(0, 60)}”` : "read it"} →</Link></>
          )}
        </span>
        <div className={`${MONO} text-[9px] flex items-center gap-2 flex-shrink-0`}>
          <button
            onClick={() => setTarget("library")}
            className={`px-2 py-0.5 border transition-colors ${searchTarget === "library" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
          >
            My Library
          </button>
          <button
            onClick={() => setTarget("discover")}
            className={`px-2 py-0.5 border transition-colors ${searchTarget === "discover" ? "border-oxblood text-oxblood" : "border-rule text-muted hover:text-ink"}`}
          >
            Discover
          </button>
        </div>
      </div>

      {/* ── BELOW THE FOLD: lede / quiet / first-run ── */}
      {state === null ? (
        /* Skeleton: two hairline rules, no shimmer, no layout shift */
        <div>
          <div className="border-t border-rule pt-4 mb-4"><div className="h-4 w-2/5 bg-ink/[0.04]" /></div>
          <div className="border-t border-rule pt-4"><div className="h-3 w-1/4 bg-ink/[0.04]" /></div>
        </div>
      ) : lede ? (
        <div>
          {/* THE LEDE */}
          <div className="border-t border-rule pt-4 mb-8">
            <div className={`${MONO} text-[10px] text-oxblood mb-2`}>
              Continue reading · {lede.progressPct}% through
            </div>
            <Link href={`/items/${lede.itemId}`} className="group block">
              <h2 className="font-serif text-[24px] font-semibold leading-tight group-hover:text-oxblood transition-colors mb-2">
                {lede.title}
              </h2>
            </Link>
            {lede.excerpt && (
              <p className="font-serif italic text-[15px] text-muted leading-relaxed mb-2 max-w-xl">
                {lede.excerpt}
              </p>
            )}
            <div className={`${MONO} text-[10px] text-muted`}>
              {lede.siteName && <>{lede.siteName} · </>}{lede.minutesLeft} min left
            </div>
          </div>

          {/* THE STANDFIRST */}
          {standfirst && (standfirst.draft || standfirst.queueCount > 0) && (
            <div className={`border-t border-b border-rule py-2 flex items-center justify-between gap-4 ${MONO} text-[10px] text-muted`}>
              <span className="truncate">
                Also waiting:{" "}
                {standfirst.draft && (
                  <Link href={`/synthesis/${standfirst.draft.id}`} className="hover:text-oxblood transition-colors">
                    a draft from {standfirst.draft.relativeDay}
                  </Link>
                )}
                {standfirst.draft && standfirst.queueCount > 0 && " · "}
                {standfirst.queueCount > 0 && (
                  <Link href="/dashboard" className="hover:text-oxblood transition-colors">
                    {standfirst.queueCount} queued · ~{standfirst.queueMinutes} min
                  </Link>
                )}
              </span>
              <Link href="/dashboard" className="text-oxblood hover:text-ink transition-colors flex-shrink-0">
                Open inbox →
              </Link>
            </div>
          )}
        </div>
      ) : quiet ? (
        /* THE QUIET STATE — one literate sentence with live links */
        <div className="border-t border-rule pt-6">
          <p className="font-serif text-[17px] leading-[1.9] max-w-[34rem]">
            <QuietSentence sentence={quiet.sentence} draftId={standfirst?.draft?.id ?? null} />
          </p>
        </div>
      ) : firstRun ? (
        <div className="border-t border-rule pt-6">
          <p className="font-serif italic text-[15px] text-muted">
            Paste your first URL above, or{" "}
            <Link href="/sources" className="text-oxblood link-underline">set up Discover sources</Link>.
          </p>
        </div>
      ) : null}

      {/* ── FOOTER ── */}
      <div className={`mt-auto pt-16 ${MONO} text-[9px] text-muted/60`}>
        / to search · esc for inbox
      </div>
    </main>

    {/* ── TOPIC RAIL (fills the wide-screen right space) ── */}
    <aside className="hidden xl:block w-72 flex-shrink-0 pt-10 pb-24">
      <div className="sticky top-10 max-h-[calc(100vh-5rem)] overflow-y-auto border-l border-rule pl-8">
        <TopicRail topics={topics} />
      </div>
    </aside>
    </div>
  );
}

/** Render the quiet sentence with its state phrases as live links. */
function QuietSentence({ sentence, draftId }: { sentence: string; draftId: string | null }) {
  // Split on the known phrase anchors and linkify them
  const parts: React.ReactNode[] = [];
  let rest = sentence;

  const draftMatch = rest.match(/A draft from [^,.]+/);
  if (draftMatch && draftId) {
    const [phrase] = draftMatch;
    const idx = rest.indexOf(phrase);
    parts.push(rest.slice(0, idx));
    parts.push(
      <Link key="draft" href={`/synthesis/${draftId}`} className="text-oxblood link-underline">{phrase}</Link>
    );
    rest = rest.slice(idx + phrase.length);
  }

  const queueMatch = rest.match(/\d+ items? (?:is|are) queued[^,.]*/);
  if (queueMatch) {
    const [phrase] = queueMatch;
    const idx = rest.indexOf(phrase);
    parts.push(rest.slice(0, idx));
    parts.push(
      <Link key="queue" href="/dashboard" className="text-oxblood link-underline">{phrase}</Link>
    );
    rest = rest.slice(idx + phrase.length);
  }

  const sourcesMatch = rest.match(/your sources are standing by/);
  if (sourcesMatch) {
    const [phrase] = sourcesMatch;
    const idx = rest.indexOf(phrase);
    parts.push(rest.slice(0, idx));
    parts.push(
      <Link key="sources" href="/find?mode=web" className="text-oxblood link-underline">{phrase}</Link>
    );
    rest = rest.slice(idx + phrase.length);
  }

  parts.push(rest);
  return <>{parts}</>;
}
