import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { fetchAndSummarize } from "@/lib/summarize";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const { title, summary, tags } = await fetchAndSummarize(url);

    // Generate embedding — fail gracefully so a save is never lost
    let embeddingFields: Record<string, unknown> = {};
    try {
      const vector = await embed(buildEmbeddingText(title, summary, tags));
      embeddingFields = {
        embedding: `[${vector.join(",")}]`,
        embedding_model: EMBEDDING_MODEL,
        embedded_at: new Date().toISOString(),
      };
    } catch (e) {
      console.error("[POST /api/items] embedding failed, saving without:", e);
    }

    const { data, error } = await supabase
      .from("reading_list")
      .insert({ user_id: user.id, url, title, summary, tags, ...embeddingFields })
      .select()
      .single();

    if (error) {
      console.error("[POST /api/items] supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message || JSON.stringify(error) }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e) {
    const message =
      e instanceof Error ? e.message
      : e && typeof e === "object" && "message" in e ? String((e as Record<string, unknown>).message)
      : String(e);
    console.error("[POST /api/items] caught:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
