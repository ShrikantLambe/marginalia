import { describe, it, expect } from "vitest";
import { computeHomeState, excerptOf, minutesLeft, composeQuiet, relativeDay, type HomeInputs } from "../home";

const NOW = new Date("2026-07-11T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

function item(overrides: Partial<HomeInputs["items"][0]> = {}): HomeInputs["items"][0] {
  return {
    id: "a", title: "The Article", site_name: "ft.com", url: "https://ft.com/a",
    summary: "First sentence here. Second sentence follows.",
    status: "reading", scroll_progress: 60, reading_time_minutes: 10,
    last_opened_at: hoursAgo(10),
    ...overrides,
  };
}

function base(overrides: Partial<HomeInputs> = {}): HomeInputs {
  return { now: NOW, items: [], queued: [], drafts: [], sourceCount: 0, ...overrides };
}

describe("excerptOf", () => {
  it("takes the first sentence", () => {
    expect(excerptOf("One sentence. Another one.")).toBe("One sentence.");
  });
  it("ellipsizes long sentences at a word boundary", () => {
    const long = "word ".repeat(60).trim() + ".";
    const out = excerptOf(long)!;
    expect(out.length).toBeLessThanOrEqual(161);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/\swor…$/);
  });
  it("returns null for null", () => {
    expect(excerptOf(null)).toBeNull();
  });
});

describe("minutesLeft", () => {
  it("scales by remaining progress, ceiling", () => {
    expect(minutesLeft(10, 60)).toBe(4);
    expect(minutesLeft(7, 50)).toBe(4);
  });
  it("never goes below 1", () => {
    expect(minutesLeft(10, 99)).toBe(1);
    expect(minutesLeft(null, 50)).toBe(1);
  });
});

describe("relativeDay", () => {
  it("handles today / yesterday / weekday / date", () => {
    expect(relativeDay(hoursAgo(2), NOW)).toBe("today");
    expect(relativeDay(hoursAgo(26), NOW)).toBe("yesterday");
    expect(relativeDay(hoursAgo(3 * 24), NOW)).toMatch(/day$/);
    expect(relativeDay(hoursAgo(20 * 24), NOW)).toMatch(/^\w{3} \d+$/);
  });
});

describe("composeQuiet", () => {
  it("composes draft + queue", () => {
    const s = composeQuiet({ id: "d", title: "T", relativeDay: "Tuesday" }, 5, 10, 0)!;
    expect(s).toBe("A draft from Tuesday is waiting, and 5 items are queued — about 10 minutes of reading.");
  });
  it("falls back to sources only when queue is empty", () => {
    expect(composeQuiet(null, 0, 0, 3)).toBe("Nothing is waiting — your sources are standing by.");
    expect(composeQuiet(null, 2, 4, 3)).toBe("2 items are queued — about 4 minutes of reading.");
  });
  it("returns null when fully empty", () => {
    expect(composeQuiet(null, 0, 0, 0)).toBeNull();
  });
});

describe("computeHomeState", () => {
  it("picks the most recent half-read item as the lede", () => {
    const state = computeHomeState(base({
      items: [
        item({ id: "old", last_opened_at: hoursAgo(30) }),
        item({ id: "new", last_opened_at: hoursAgo(5), scroll_progress: 75 }),
        item({ id: "done", status: "read", scroll_progress: 100 }),
      ],
    }));
    expect(state.lede).toMatchObject({ itemId: "new", progressPct: 75, minutesLeft: 3 });
    expect(state.lede!.excerpt).toBe("First sentence here.");
    expect(state.quiet).toBeNull();
  });

  it("produces the quiet sentence when nothing is resumable", () => {
    const state = computeHomeState(base({
      queued: [{ reading_time_minutes: 6 }, { reading_time_minutes: 4 }],
      drafts: [{ id: "d1", title: "Draft", created_at: hoursAgo(24) }],
    }));
    expect(state.lede).toBeNull();
    expect(state.quiet!.sentence).toContain("A draft from yesterday is waiting");
    expect(state.quiet!.sentence).toContain("2 items are queued — about 10 minutes");
    expect(state.standfirst.queueCount).toBe(2);
  });

  it("is fully null for a brand-new account", () => {
    const state = computeHomeState(base());
    expect(state.lede).toBeNull();
    expect(state.quiet).toBeNull();
    expect(state.standfirst.queueCount).toBe(0);
  });
});
