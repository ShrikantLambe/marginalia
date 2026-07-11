/**
 * The Morning Paper resolver — deterministic front-page state from existing
 * columns. Supersedes the Welcome Back panel's resolver. Pure functions over
 * row inputs, testable without Supabase. No LLM calls, no page fetches.
 */

export type HomeLede = {
  itemId: string;
  title: string;
  siteName: string | null;
  progressPct: number;
  excerpt: string | null;
  minutesLeft: number;
};

export type HomeStandfirst = {
  draft: null | { id: string; title: string; relativeDay: string };
  queueCount: number;
  queueMinutes: number;
  unreadCount: number;
};

export type HomeState = {
  lede: HomeLede | null;
  standfirst: HomeStandfirst;
  quiet: null | { sentence: string };
};

export type HomeInputs = {
  now: Date;
  items: Array<{
    id: string;
    title: string | null;
    site_name: string | null;
    url: string;
    summary: string | null;
    status: string;
    scroll_progress: number;
    reading_time_minutes: number | null;
    last_opened_at: string | null;
  }>;
  queued: Array<{ reading_time_minutes: number | null }>;
  drafts: Array<{ id: string; title: string | null; created_at: string }>;
  sourceCount: number;
};

const DAY_MS = 86_400_000;

/** First sentence of the TL;DR, max ~160 chars, ellipsized at a word boundary. */
export function excerptOf(summary: string | null, max = 160): string | null {
  if (!summary) return null;
  const firstSentence = summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? summary.trim();
  if (firstSentence.length <= max) return firstSentence;
  const cut = firstSentence.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + "…";
}

/** ceil(estimate × (1 − progress/100)), min 1. */
export function minutesLeft(readingTimeMinutes: number | null, progressPct: number): number {
  const estimate = readingTimeMinutes ?? 1;
  return Math.max(1, Math.ceil(estimate * (1 - progressPct / 100)));
}

/** "today" / "yesterday" / weekday name within the last week / "Mon D". */
export function relativeDay(iso: string, now: Date): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return then.toLocaleDateString("en-US", { weekday: "long" });
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** One literate sentence about the ambient state. No exclamation marks. */
export function composeQuiet(
  draft: HomeStandfirst["draft"],
  queueCount: number,
  queueMinutes: number,
  sourceCount: number
): string | null {
  const parts: string[] = [];
  if (draft) parts.push(`A draft from ${draft.relativeDay} is waiting`);
  if (queueCount > 0) {
    parts.push(
      `${queueCount} ${queueCount === 1 ? "item is" : "items are"} queued — about ${queueMinutes} ${queueMinutes === 1 ? "minute" : "minutes"} of reading`
    );
  }
  if (parts.length === 0 && sourceCount > 0) {
    parts.push("Nothing is waiting — your sources are standing by");
  }
  if (parts.length === 0) return null;
  const sentence = parts.join(", and ").replace(/^(.)/, (c) => c.toUpperCase());
  return sentence + ".";
}

export function computeHomeState(input: HomeInputs): HomeState {
  const { now, items, queued, drafts, sourceCount } = input;
  const nowMs = now.getTime();

  // Lede = the resume_reading rule: 25–99% through, not done, opened within 14 days
  const resumable = items
    .filter(
      (i) =>
        i.scroll_progress >= 25 &&
        i.scroll_progress <= 99 &&
        i.status !== "read" &&
        i.status !== "archived" &&
        i.status !== "failed" &&
        i.last_opened_at &&
        nowMs - new Date(i.last_opened_at).getTime() <= 14 * DAY_MS
    )
    .sort((a, b) => new Date(b.last_opened_at!).getTime() - new Date(a.last_opened_at!).getTime());

  const top = resumable[0];
  const lede: HomeLede | null = top
    ? {
        itemId: top.id,
        title: top.title ?? top.url,
        siteName: top.site_name,
        progressPct: top.scroll_progress,
        excerpt: excerptOf(top.summary),
        minutesLeft: minutesLeft(top.reading_time_minutes, top.scroll_progress),
      }
    : null;

  const recentDraft = drafts
    .filter((d) => nowMs - new Date(d.created_at).getTime() <= 14 * DAY_MS)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  const draft = recentDraft
    ? {
        id: recentDraft.id,
        title: recentDraft.title ?? "Untitled draft",
        relativeDay: relativeDay(recentDraft.created_at, now),
      }
    : null;

  const queueCount = queued.length;
  const queueMinutes = queued.reduce((acc, q) => acc + (q.reading_time_minutes ?? 0), 0);

  return {
    lede,
    standfirst: { draft, queueCount, queueMinutes, unreadCount: queueCount },
    quiet: lede ? null : (() => {
      const sentence = composeQuiet(draft, queueCount, queueMinutes, sourceCount);
      return sentence ? { sentence } : null;
    })(),
  };
}
