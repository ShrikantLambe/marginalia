/**
 * Welcome Back resolver — deterministic, computed from existing rows.
 * Pure function over row inputs so it's testable without Supabase.
 */

export type WelcomeSuggestion =
  | { type: "resume_reading"; itemId: string; title: string; progressPct: number }
  | { type: "resume_draft"; id: string; title: string }
  | { type: "resume_search"; query: string; scope: unknown }
  | { type: "review_unread"; count: number };

export type WelcomeState = {
  suggestions: WelcomeSuggestion[];
  lastSeenAt: string | null;
  unreadCount: number;
  shouldShowWelcome: boolean;
};

export type WelcomeInputs = {
  now: Date;
  items: Array<{
    id: string;
    title: string | null;
    status: string;
    scroll_progress: number;
    last_opened_at: string | null;
  }>;
  syntheses: Array<{ id: string; title: string | null; created_at: string }>;
  searches: Array<{ id: string; query: string; scope: unknown; created_at: string }>;
  /** URLs of items captured after the most recent search that appeared in that search's cached results */
  capturedFromLastSearch: boolean;
  unreadCount: number;
};

const DAY_MS = 86_400_000;
const GAP_MS = 4 * 3_600_000;

export function computeWelcomeState(input: WelcomeInputs): WelcomeState {
  const { now, items, syntheses, searches, capturedFromLastSearch, unreadCount } = input;
  const nowMs = now.getTime();
  const suggestions: WelcomeSuggestion[] = [];

  // 1. resume_reading — most recent item 25–99% read, not done, opened within 14 days
  const resumable = items
    .filter(
      (i) =>
        i.scroll_progress >= 25 &&
        i.scroll_progress <= 99 &&
        i.status !== "read" &&
        i.status !== "archived" &&
        i.last_opened_at &&
        nowMs - new Date(i.last_opened_at).getTime() <= 14 * DAY_MS
    )
    .sort((a, b) => new Date(b.last_opened_at!).getTime() - new Date(a.last_opened_at!).getTime());
  if (resumable[0]) {
    suggestions.push({
      type: "resume_reading",
      itemId: resumable[0].id,
      title: resumable[0].title ?? "Untitled",
      progressPct: resumable[0].scroll_progress,
    });
  }

  // 2. resume_draft — most recent synthesis within 14 days
  // (syntheses has no updated_at or finalization column, so all are resumable)
  const recentDraft = syntheses
    .filter((s) => nowMs - new Date(s.created_at).getTime() <= 14 * DAY_MS)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (recentDraft) {
    suggestions.push({ type: "resume_draft", id: recentDraft.id, title: recentDraft.title ?? "Untitled draft" });
  }

  // 3. resume_search — most recent Discover search within 7 days, unless the
  //    user already captured something from it
  const recentSearch = searches
    .filter((s) => nowMs - new Date(s.created_at).getTime() <= 7 * DAY_MS)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
  if (recentSearch && !capturedFromLastSearch) {
    suggestions.push({ type: "resume_search", query: recentSearch.query, scope: recentSearch.scope });
  }

  // 4. review_unread — only when the queue is actually piling up
  if (suggestions.length < 3 && unreadCount > 5) {
    suggestions.push({ type: "review_unread", count: unreadCount });
  }

  // lastSeenAt: newest activity timestamp that is ≥ 4 hours old
  const activityTimes = [
    ...items.map((i) => i.last_opened_at).filter(Boolean).map((t) => new Date(t!).getTime()),
    ...searches.map((s) => new Date(s.created_at).getTime()),
    ...syntheses.map((s) => new Date(s.created_at).getTime()),
  ].filter((t) => nowMs - t >= GAP_MS);
  const lastSeenMs = activityTimes.length ? Math.max(...activityTimes) : null;

  // Show after a 4+ hour gap, or if there's been no activity at all today
  const newestActivity = [
    ...items.map((i) => i.last_opened_at).filter(Boolean).map((t) => new Date(t!).getTime()),
    ...searches.map((s) => new Date(s.created_at).getTime()),
    ...syntheses.map((s) => new Date(s.created_at).getTime()),
  ];
  const newestMs = newestActivity.length ? Math.max(...newestActivity) : null;
  const shouldShowWelcome = newestMs === null || nowMs - newestMs >= GAP_MS;

  return {
    suggestions: suggestions.slice(0, 3),
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
    unreadCount,
    shouldShowWelcome,
  };
}
