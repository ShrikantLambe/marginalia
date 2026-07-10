import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { normalizeDomain } from "@/lib/domains";

export const runtime = "nodejs";

export async function GET(_req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [sourcesRes, itemsRes, violationsRes] = await Promise.all([
    supabase.from("sources").select("*").eq("user_id", user.id).order("created_at"),
    supabase
      .from("reading_list")
      .select("site_name, author, url")
      .eq("user_id", user.id)
      .limit(500),
    supabase
      .from("discover_guardrail_violations")
      .select("url, query, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (sourcesRes.error) return NextResponse.json({ error: sourcesRes.error.message }, { status: 500 });
  const sources = sourcesRes.data ?? [];

  // "From your library" suggestions: distinct domains + authors not already sourced
  const existingDomains = new Set(sources.filter((s) => s.type === "domain").map((s) => s.value));
  const existingAuthors = new Set(sources.filter((s) => s.type === "author").map((s) => s.value.toLowerCase()));
  const domainCounts = new Map<string, number>();
  const authorCounts = new Map<string, number>();
  for (const item of itemsRes.data ?? []) {
    const domain = normalizeDomain(item.url ?? "");
    if (domain && !existingDomains.has(domain)) {
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
    const author = item.author?.trim();
    // Single-token names ("Joe") are junk suggestions — require at least two words
    if (author && author.includes(" ") && !existingAuthors.has(author.toLowerCase())) {
      authorCounts.set(author, (authorCounts.get(author) ?? 0) + 1);
    }
  }
  const topOf = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count }));

  return NextResponse.json({
    sources,
    suggestions: { domains: topOf(domainCounts), authors: topOf(authorCounts) },
    violations: violationsRes.data ?? [],
  });
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const type = body.type === "author" ? "author" : body.type === "domain" ? "domain" : null;
  if (!type) return NextResponse.json({ error: "type must be 'domain' or 'author'" }, { status: 400 });

  let value: string | null = null;
  let homeDomains: string[] | null = null;

  if (type === "domain") {
    value = normalizeDomain(typeof body.value === "string" ? body.value : "");
    if (!value) return NextResponse.json({ error: "Not a valid domain" }, { status: 400 });
  } else {
    value = typeof body.value === "string" ? body.value.trim() : "";
    if (!value) return NextResponse.json({ error: "Author name is required" }, { status: 400 });
    if (Array.isArray(body.home_domains)) {
      homeDomains = body.home_domains
        .map((d: unknown) => (typeof d === "string" ? normalizeDomain(d) : null))
        .filter((d: string | null): d is string => d !== null);
    }
  }

  const { data, error } = await supabase
    .from("sources")
    .insert({
      user_id: user.id,
      type,
      value,
      home_domains: homeDomains,
      brief_id: typeof body.brief_id === "string" ? body.brief_id : null,
      notes: typeof body.notes === "string" ? body.notes : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Already in your sources" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
