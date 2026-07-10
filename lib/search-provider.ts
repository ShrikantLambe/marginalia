/**
 * Thin adapter over the external web-search API, isolating the provider the
 * way lib/summarize.ts isolates Gemini. Swap Tavily for Exa/Brave here
 * without touching routes.
 */

export type SearchResultItem = {
  url: string;
  title: string;
  snippet: string;
  publishedDate?: string;
};

export type SearchParams = {
  query: string;
  includeDomains: string[];
  maxResults?: number;
};

export class ProviderAuthError extends Error {}
export class ProviderRateLimitError extends Error {}
export class ProviderUnavailableError extends Error {}

export const SEARCH_PROVIDER_NAME =
  !process.env.TAVILY_API_KEY || process.env.SEARCH_PROVIDER === "mock"
    ? "mock"
    : "tavily";

/** Mock fixtures deliberately include one result from a domain NOT in
 *  includeDomains — the /api/discover enforcement layer is tested with it. */
export const MOCK_ROGUE_DOMAIN = "rogue-content-farm.example";

function mockSearch({ query, includeDomains, maxResults = 10 }: SearchParams): SearchResultItem[] {
  const inScope = includeDomains.slice(0, Math.max(1, maxResults - 1)).map((domain, i) => ({
    url: `https://${domain}/articles/${encodeURIComponent(query.replace(/\s+/g, "-").toLowerCase())}-${i + 1}`,
    title: `${query} — perspective ${i + 1} from ${domain}`,
    snippet: `A mock result about "${query}" from ${domain}, for development and tests.`,
    publishedDate: new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10),
  }));
  return [
    ...inScope,
    {
      url: `https://${MOCK_ROGUE_DOMAIN}/spam/${encodeURIComponent(query)}`,
      title: `${query} — result the provider should not have returned`,
      snippet: "Rogue-domain fixture: must be dropped by server-side enforcement.",
    },
  ];
}

async function tavilySearch({ query, includeDomains, maxResults = 10 }: SearchParams): Promise<SearchResultItem[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      query,
      include_domains: includeDomains,
      max_results: Math.min(maxResults, 20),
      search_depth: "basic",
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch((e) => {
    throw new ProviderUnavailableError(e instanceof Error ? e.message : String(e));
  });

  if (res.status === 401 || res.status === 403) throw new ProviderAuthError("Search provider rejected the API key.");
  if (res.status === 429) throw new ProviderRateLimitError("Search provider rate limit hit.");
  if (!res.ok) throw new ProviderUnavailableError(`Search provider returned ${res.status}.`);

  const data = await res.json();
  const results: unknown[] = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        url: typeof row.url === "string" ? row.url : "",
        title: typeof row.title === "string" ? row.title : "",
        snippet: typeof row.content === "string" ? row.content.slice(0, 300) : "",
        publishedDate: typeof row.published_date === "string" ? row.published_date : undefined,
      };
    })
    .filter((r) => r.url);
}

export async function search(params: SearchParams): Promise<SearchResultItem[]> {
  if (SEARCH_PROVIDER_NAME === "mock") return mockSearch(params);
  return tavilySearch(params);
}
