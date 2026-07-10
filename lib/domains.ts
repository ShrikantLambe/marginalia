import { getDomain } from "tldts";

/**
 * Normalize a URL or bare domain to its registrable domain (eTLD+1).
 * "https://www.bbc.co.uk/news/x" → "bbc.co.uk"; "co.uk" alone → null.
 * Backed by the public-suffix list via tldts — never hand-rolled.
 */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const domain = getDomain(trimmed, { allowPrivateDomains: false });
  return domain ?? null;
}
