import { describe, it, expect } from "vitest";
import { computeWelcomeState, type WelcomeInputs } from "../welcome";

const NOW = new Date("2026-07-09T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function base(overrides: Partial<WelcomeInputs> = {}): WelcomeInputs {
  return { now: NOW, items: [], syntheses: [], searches: [], capturedFromLastSearch: false, unreadCount: 0, sourceCount: 3, ...overrides };
}

describe("computeWelcomeState", () => {
  it("returns greeting-only for a brand-new user with sources", () => {
    const state = computeWelcomeState(base());
    expect(state.suggestions).toEqual([]);
    expect(state.shouldShowWelcome).toBe(true);
    expect(state.lastSeenAt).toBeNull();
  });

  it("offers Discover setup when there is nothing to resume and zero sources", () => {
    const state = computeWelcomeState(base({ sourceCount: 0 }));
    expect(state.suggestions).toEqual([{ type: "setup_discover" }]);
  });

  it("does not offer Discover setup when something real is resumable", () => {
    const state = computeWelcomeState(base({
      sourceCount: 0,
      items: [{ id: "a", title: "T", status: "reading", scroll_progress: 50, last_opened_at: hoursAgo(10) }],
    }));
    expect(state.suggestions.some((s) => s.type === "setup_discover")).toBe(false);
  });

  it("suggests resuming a half-read article, most recent first", () => {
    const state = computeWelcomeState(base({
      items: [
        { id: "a", title: "Older", status: "reading", scroll_progress: 50, last_opened_at: hoursAgo(30) },
        { id: "b", title: "Newer", status: "reading", scroll_progress: 75, last_opened_at: hoursAgo(10) },
        { id: "c", title: "Done", status: "read", scroll_progress: 100, last_opened_at: hoursAgo(5) },
      ],
    }));
    expect(state.suggestions[0]).toMatchObject({ type: "resume_reading", itemId: "b", progressPct: 75 });
  });

  it("suppresses resume_search after a capture from it", () => {
    const searches = [{ id: "s1", query: "data contracts", scope: { mode: "all" }, created_at: hoursAgo(20) }];
    const without = computeWelcomeState(base({ searches }));
    expect(without.suggestions.some((s) => s.type === "resume_search")).toBe(true);
    const withCapture = computeWelcomeState(base({ searches, capturedFromLastSearch: true }));
    expect(withCapture.suggestions.some((s) => s.type === "resume_search")).toBe(false);
  });

  it("only surfaces unread pile above 5", () => {
    expect(computeWelcomeState(base({ unreadCount: 5 })).suggestions).toEqual([]);
    expect(computeWelcomeState(base({ unreadCount: 6 })).suggestions[0]).toMatchObject({ type: "review_unread", count: 6 });
  });

  it("hides the panel mid-session (activity within 4 hours)", () => {
    const state = computeWelcomeState(base({
      items: [{ id: "a", title: "T", status: "reading", scroll_progress: 50, last_opened_at: hoursAgo(1) }],
    }));
    expect(state.shouldShowWelcome).toBe(false);
  });

  it("caps suggestions at 3, one per type", () => {
    const state = computeWelcomeState(base({
      items: [{ id: "a", title: "T", status: "reading", scroll_progress: 50, last_opened_at: hoursAgo(10) }],
      syntheses: [{ id: "d1", title: "Draft", created_at: hoursAgo(12) }],
      searches: [{ id: "s1", query: "q", scope: { mode: "all" }, created_at: hoursAgo(11) }],
      unreadCount: 10,
    }));
    expect(state.suggestions).toHaveLength(3);
    expect(new Set(state.suggestions.map((s) => s.type)).size).toBe(3);
  });
});
