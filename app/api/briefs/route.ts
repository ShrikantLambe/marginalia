import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";
import { autoMatchItemsToBrief } from "@/lib/brief-routing";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "open";

  const query = status === "all"
    ? supabase.from("briefs").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
    : supabase.from("briefs").select("*").eq("user_id", user.id).eq("status", status).order("created_at", { ascending: false });

  const { data: briefs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!briefs?.length) return NextResponse.json([]);

  // Attach item counts (excluding dismissed)
  const { data: counts } = await supabase
    .from("brief_items")
    .select("brief_id")
    .in("brief_id", briefs.map(b => b.id))
    .eq("user_dismissed", false);

  const countMap: Record<string, number> = {};
  for (const row of counts ?? []) {
    countMap[row.brief_id] = (countMap[row.brief_id] ?? 0) + 1;
  }

  return NextResponse.json(briefs.map(b => ({ ...b, item_count: countMap[b.id] ?? 0 })));
}

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(`briefs:${user.id}`, 20)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

  const description = typeof body.description === "string" ? body.description.trim() || null : null;

  // Embed the question
  let embeddingFields: Record<string, unknown> = {};
  let embeddingVec: number[] | null = null;
  try {
    const text = description ? `${question}\n\n${description}` : question;
    embeddingVec = await embed(text);
    embeddingFields = { embedding: `[${embeddingVec.join(",")}]` };
  } catch (e) {
    console.error("[POST /api/briefs] embed failed:", e);
  }

  const { data: brief, error } = await supabase
    .from("briefs")
    .insert({ user_id: user.id, question, description, ...embeddingFields })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Auto-match existing items against this brief (fire-and-forget)
  if (embeddingVec) {
    autoMatchItemsToBrief(user.id, brief.id, embeddingVec).catch(() => {});
  }

  return NextResponse.json(brief);
}
