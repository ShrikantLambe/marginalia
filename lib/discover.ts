import { createHash } from "crypto";
import { normalizeDomain } from "./domains";
import type { SearchResultItem } from "./search-provider";

/**
 * THE guardrail: re-parse every result URL and keep only those whose
 * registrable domain is in the allowlist. The provider's include_domains
 * is just a hint; this layer is the enforcement.
 */
export function enforceAllowlist(
  results: SearchResultItem[],
  allowlist: string[]
): { kept: SearchResultItem[]; dropped: SearchResultItem[] } {
  const allowed = new Set(allowlist);
  const kept: SearchResultItem[] = [];
  const dropped: SearchResultItem[] = [];
  for (const r of results) {
    const domain = normalizeDomain(r.url);
    (domain && allowed.has(domain) ? kept : dropped).push(r);
  }
  return { kept, dropped };
}

/** Deterministic cache key over the effective allowlist + normalized query. */
export function buildCacheKey(query: string, allowlist: string[]): string {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, " ");
  const sortedList = [...allowlist].sort().join(",");
  return createHash("sha256").update(`${sortedList}|${normalizedQuery}`).digest("hex");
}
