/**
 * Bounded retry with exponential backoff + jitter, for calls to shared
 * upstream APIs (Gemini) whose per-key rate limits are hit under concurrent
 * multi-user load. Retries only transient failures (429 / 408 / 5xx / network),
 * never a 4xx that won't improve on retry.
 */

export function isTransient(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (typeof status === "number") return status === 429 || status === 408 || status >= 500;
  const msg = String((e as { message?: unknown })?.message ?? e).toLowerCase();
  return /\b(408|429|500|502|503|504)\b|overloaded|rate limit|quota|timeout|econnreset|etimedout|fetch failed|network/.test(msg);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; isRetryable?: (e: unknown) => boolean } = {}
): Promise<T> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 400;
  const isRetryable = opts.isRetryable ?? isTransient;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !isRetryable(e)) throw e;
      // Exponential backoff (400ms, 800ms, 1600ms…) plus up to one base of jitter
      const delay = baseMs * 2 ** attempt + Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
