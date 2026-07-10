/**
 * Byline extraction + fuzzy author matching for author-scoped Discover results.
 */

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(name: string): string[] {
  return stripDiacritics(name.toLowerCase())
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["by", "and", "contributor", "staff", "the"].includes(t));
}

/**
 * Token-set fuzzy match: "By Benn Stancil, Contributor" matches "Benn Stancil".
 * Returns the matched author name or null.
 */
export function matchAuthor(byline: string, authorNames: string[]): string | null {
  const bylineTokens = new Set(tokenize(byline));
  if (bylineTokens.size === 0) return null;
  for (const name of authorNames) {
    const nameTokens = tokenize(name);
    if (nameTokens.length === 0) continue;
    if (nameTokens.every((t) => bylineTokens.has(t))) return name;
  }
  return null;
}

/** Pull candidate byline strings out of a page's HTML, best effort, in priority order. */
export function extractBylineFromHtml(html: string): string | null {
  // 1. JSON-LD schema.org Article author.name (handles arrays and nesting)
  const ldBlocks = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of ldBlocks) {
    const jsonText = block.replace(/<script[^>]*>|<\/script>/gi, "").trim();
    try {
      const parsed = JSON.parse(jsonText);
      const nodes = Array.isArray(parsed) ? parsed : [parsed, ...(Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [])];
      for (const node of nodes) {
        const type = node?.["@type"];
        const isArticle = type === "Article" || type === "NewsArticle" ||
          (Array.isArray(type) && type.some((t: string) => t === "Article" || t === "NewsArticle"));
        if (!isArticle || !node.author) continue;
        const authors = Array.isArray(node.author) ? node.author : [node.author];
        const names = authors
          .map((a: unknown) => (typeof a === "string" ? a : (a as Record<string, unknown>)?.name))
          .filter((n: unknown): n is string => typeof n === "string" && n.trim().length > 0);
        if (names.length) return names.join(", ");
      }
    } catch { /* malformed JSON-LD — try the next block */ }
  }

  // 2. <meta name="author"> / <meta property="article:author">
  const metaMatch =
    html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']author["']/i) ??
    html.match(/<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i);
  if (metaMatch?.[1] && !metaMatch[1].startsWith("http")) return metaMatch[1];

  // 3. rel="author" / common byline selectors, crude but best-effort
  const relMatch = html.match(/<a[^>]+rel=["']author["'][^>]*>([^<]{2,80})</i);
  if (relMatch?.[1]) return relMatch[1].trim();
  const classMatch = html.match(/class=["'][^"']*byline[^"']*["'][^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,80})</i);
  if (classMatch?.[1]) return classMatch[1].trim();

  return null;
}

/** Fetch a result page and extract its byline. 8s timeout, one retry. */
export async function extractByline(url: string): Promise<string | null> {
  const attempt = async () => {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8_000),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractBylineFromHtml(html.slice(0, 500_000));
  };
  try {
    return await attempt();
  } catch {
    try { return await attempt(); } catch { return null; }
  }
}
