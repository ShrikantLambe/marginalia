import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { fetchAndSummarize } from "@/lib/summarize";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";
import { checkDailyLimit, logUsage } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const withinLimit = await checkDailyLimit(user.id);
  if (!withinLimit) {
    return NextResponse.json(
      { error: "Daily AI limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  const { id } = await params;

  const { data: item } = await supabase
    .from("reading_list")
    .select("url")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { title, summary, tags } = await fetchAndSummarize(item.url);
    await logUsage(user.id, "summarize");

    const updates: Record<string, unknown> = { title, summary, tags };

    try {
      const vector = await embed(buildEmbeddingText(title, summary, tags));
      updates.embedding = `[${vector.join(",")}]`;
      updates.embedding_model = EMBEDDING_MODEL;
      updates.embedded_at = new Date().toISOString();
      await logUsage(user.id, "embed");
    } catch {
      // Embedding failure doesn't block the save
    }

    const { data, error } = await supabase
      .from("reading_list")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
