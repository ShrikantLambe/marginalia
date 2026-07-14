import { NextResponse, after } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase, type Source, type DiscoverResult, type DiscoverScope } from "@/lib/supabase";
import { search, SEARCH_PROVIDER_NAME, ProviderAuthError, ProviderRateLimitError } from "@/lib/search-provider";
import { enforceAllowlist, buildCacheKey } from "@/lib/discover";
import { extractByline, matchAuthor } from "@/lib/bylines";
import { rateLimit } from "@/lib/rate-limit";
import { checkAndLog } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 24 * 3_600_000;

/** GET: recent + saved searches for the Discover page shell. */
export async function GET(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [recentRes, savedRes] = await Promise.all([
    supabase
      .from("discover_searches")
      .select("id, query, scope, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("discover_saved_searches")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({ recent: recentRes.data ?? [], saved: savedRes.data ?? [] });
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
  const scope: DiscoverScope = body.scope?.mode ? body.scope : { mode: "all" };
  const refresh = body.refresh === true;

  // 1. Resolve scoped sources — ONLY this user's
  let sourcesQuery = supabase.from("sources").select("*").eq("user_id", user.id);
  if (scope.mode === "brief" && scope.briefId) sourcesQuery = sourcesQuery.eq("brief_id", scope.briefId);
  if (scope.mode === "custom" && scope.sourceIds?.length) sourcesQuery = sourcesQuery.in("id", scope.sourceIds);
  const { data: scopedSources } = await sourcesQuery;
  const sources = (scopedSources ?? []) as Source[];

  // Build the domain allowlist: domain sources + author home domains.
  // Empty allowlist → 400. NEVER fall back to open search.
  const allowlist = [
    ...new Set([
      ...sources.filter((s) => s.type === "domain").map((s) => s.value),
      ...sources.filter((s) => s.type === "author").flatMap((s) => s.home_domains ?? []),
    ]),
  ];
  if (allowlist.length === 0) {
    return NextResponse.json({ error: "No sources in scope — add sources first." }, { status: 400 });
  }
  const authorNames = sources.filter((s) => s.type === "author").map((s) => s.value);

  // Lazy cleanup of this user's expired cache rows (cheap, avoids a cron) —
  // deferred; the current request's cache read already filters expired rows.
  after(() => {
    void supabase.from("discover_cache").delete().eq("user_id", user.id).lt("expires_at", new Date().toISOString());
  });

  // Cache check — hits skip the provider AND the daily budget
  const cacheKey = buildCacheKey(query, allowlist);
  if (!refresh) {
    const { data: cached } = await supabase
      .from("discover_cache")
      .select("results, expires_at")
      .eq("user_id", user.id)
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cached) {
      const results = await attachLibraryState(user.id, cached.results as DiscoverResult[]);
      return NextResponse.json({
        results,
        meta: { cached: true, requested: results.length, dropped: 0, allowlistSize: allowlist.length },
      });
    }
  }

  // 2. Rate limit + daily budget (only for real provider executions)
  if (!rateLimit(`discover:${user.id}`, 10)) {
    return NextResponse.json({ error: "Too many searches. Wait a moment." }, { status: 429 });
  }
  const allowed = await checkAndLog(user.id, "discover");
  if (!allowed) {
    return NextResponse.json({ error: "Daily AI limit reached. Try again tomorrow." }, { status: 429 });
  }

  // 3. Provider call (include_domains is a hint, not the guardrail)
  let providerResults;
  try {
    providerResults = await search({ query, includeDomains: allowlist, maxResults: 10 });
  } catch (e) {
    if (e instanceof ProviderAuthError) return NextResponse.json({ error: "Search provider auth failed." }, { status: 502 });
    if (e instanceof ProviderRateLimitError) return NextResponse.json({ error: "Search provider is rate-limiting. Try again shortly." }, { status: 429 });
    return NextResponse.json({ error: "Search provider unavailable. Try again shortly." }, { status: 502 });
  }

  // 4. ENFORCEMENT — the actual guardrail
  const { kept, dropped } = enforceAllowlist(providerResults, allowlist);

  // 5. Byline verification for author-scoped results (bounded: 5 concurrent, 10s budget)
  const verified: DiscoverResult[] = authorNames.length > 0 ? await verifyBylines(kept, authorNames) : kept;

  // 6. Persist cache + logs after the response (deferred so it can't be dropped
  //    when the instance is reclaimed, and doesn't delay the results).
  after(() => {
    if (dropped.length) {
      void supabase.from("discover_guardrail_violations").insert(
        dropped.map((d) => ({ user_id: user.id, query, url: d.url, provider: SEARCH_PROVIDER_NAME }))
      );
    }
    void supabase.from("discover_cache").upsert(
      {
        user_id: user.id,
        cache_key: cacheKey,
        results: verified,
        expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "user_id,cache_key" }
    );
    void supabase.from("discover_searches").insert({
      user_id: user.id,
      query,
      scope,
      cache_key: cacheKey,
      result_count: verified.length,
      dropped_count: dropped.length,
    });
  });

  const results = await attachLibraryState(user.id, verified);

  return NextResponse.json({
    results,
    meta: { cached: false, requested: providerResults.length, dropped: dropped.length, allowlistSize: allowlist.length },
  });
}

/** Dedupe against the library via the (user_id, url) uniqueness — flag, don't remove. */
async function attachLibraryState(userId: string, results: DiscoverResult[]): Promise<DiscoverResult[]> {
  if (!results.length) return results;
  // Failed captures stay OUT of dedupe — a retry-worthy URL must not be
  // flagged "in your library"
  const { data: existing } = await supabase
    .from("reading_list")
    .select("id, url")
    .eq("user_id", userId)
    .neq("status", "failed")
    .in("url", results.map((r) => r.url));
  const byUrl = new Map((existing ?? []).map((e) => [e.url, e.id]));
  return results.map((r) =>
    byUrl.has(r.url) ? { ...r, alreadyCaptured: true, itemId: byUrl.get(r.url) } : { ...r, alreadyCaptured: false }
  );
}

/** Verified results sort first; unverified are de-emphasized, never dropped. */
async function verifyBylines(results: DiscoverResult[], authorNames: string[]): Promise<DiscoverResult[]> {
  const budget = Date.now() + 10_000;
  const out: DiscoverResult[] = [...results];
  let index = 0;
  async function worker() {
    while (index < out.length && Date.now() < budget) {
      const i = index++;
      const byline = await extractByline(out[i].url).catch(() => null);
      if (byline) {
        const matched = matchAuthor(byline, authorNames);
        out[i] = matched
          ? { ...out[i], authorVerification: "verified", matchedAuthor: matched }
          : { ...out[i], authorVerification: "unverified" };
      } else {
        out[i] = { ...out[i], authorVerification: "unknown" };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, out.length) }, worker));
  // Past the budget, anything untouched stays unverified-unknown rather than blocking
  const rank = (r: DiscoverResult) => (r.authorVerification === "verified" ? 0 : 1);
  return out
    .map((r) => (r.authorVerification ? r : { ...r, authorVerification: "unknown" as const }))
    .sort((a, b) => rank(a) - rank(b));
}
