import { describe, it, expect } from "vitest";
import { withRetry, isTransient } from "../retry";

describe("isTransient", () => {
  it("treats 429 / 408 / 5xx as transient", () => {
    expect(isTransient({ status: 429 })).toBe(true);
    expect(isTransient({ status: 408 })).toBe(true);
    expect(isTransient({ status: 503 })).toBe(true);
  });
  it("treats 4xx (non-408/429) as permanent", () => {
    expect(isTransient({ status: 400 })).toBe(false);
    expect(isTransient({ status: 404 })).toBe(false);
  });
  it("falls back to message matching when there is no status", () => {
    expect(isTransient(new Error("model is overloaded"))).toBe(true);
    expect(isTransient(new Error("429 Too Many Requests"))).toBe(true);
    expect(isTransient(new Error("invalid argument"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns on first success without retrying", async () => {
    let calls = 0;
    const out = await withRetry(async () => { calls++; return "ok"; }, { baseMs: 1 });
    expect(out).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries transient failures then succeeds", async () => {
    let calls = 0;
    const out = await withRetry(async () => {
      calls++;
      if (calls < 3) throw { status: 503 };
      return "recovered";
    }, { baseMs: 1 });
    expect(out).toBe("recovered");
    expect(calls).toBe(3);
  });

  it("does not retry a permanent error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw { status: 400 }; }, { baseMs: 1 })
    ).rejects.toEqual({ status: 400 });
    expect(calls).toBe(1);
  });

  it("gives up after the retry budget", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw { status: 429 }; }, { retries: 2, baseMs: 1 })
    ).rejects.toEqual({ status: 429 });
    expect(calls).toBe(3); // initial + 2 retries
  });
});
