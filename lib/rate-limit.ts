/**
 * Minimal in-process rate limiter.
 * Resets per serverless instance, so this is a soft limit — not suitable for
 * absolute billing controls (use checkAndLog for that). Suitable for blocking
 * accidental hammering within a single cold-start lifecycle.
 *
 * For production multi-instance deployments, replace with Upstash Redis.
 */

const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param key   Unique identifier (e.g. userId + endpoint)
 * @param limit Max requests per window
 * @param windowMs Window duration in ms (default 60s)
 */
export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
