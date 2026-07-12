import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { fetchAndSummarize, ExtractionError, titleFromUrl } from "@/lib/summarize";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";
import { checkAndLog, logUsage, DAILY_LIMIT } from "@/lib/usage-log";
import { generateEditorialNote } from "@/lib/editorial";
import { rateLimit } from "@/lib/rate-limit";
import { autoRouteToBriefs } from "@/lib/brief-routing";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  const projectId = typeof body?.project_id === "string" ? body.project_id : null;
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });
  try { new URL(url); } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // 10 saves per minute per user (each triggers a full Gemini pipeline)
  if (!rateLimit(`save:${user.id}`, 10)) {
    return NextResponse.json({ error: "Too many saves. Wait a moment." }, { status: 429 });
  }

  try {
    const { title, summary, tags, articleHtml, articleText, author, siteName, heroImageUrl, wordCount, readingTimeMinutes } = await fetchAndSummarize(url);
    const allowed = await checkAndLog(user.id, "summarize");
    if (!allowed) {
      return NextResponse.json(
        { error: `You've reached your daily limit of ${DAILY_LIMIT} AI operations. Try again tomorrow.` },
        { status: 429 }
      );
    }

    // Embedding — fail gracefully, never block the save
    const embeddingFields: Record<string, unknown> = {};
    let embeddingVec: number[] | null = null;
    try {
      embeddingVec = await embed(buildEmbeddingText(title, summary, tags));
      embeddingFields.embedding = `[${embeddingVec.join(",")}]`;
      embeddingFields.embedding_model = EMBEDDING_MODEL;
      embeddingFields.embedded_at = new Date().toISOString();
      await logUsage(user.id, "embed");
    } catch (e) {
      console.error("[POST /api/items] embedding failed, saving without:", e);
    }

    const { data: savedItem, error } = await supabase
      .from("reading_list")
      .insert({
        user_id: user.id, url, title, summary, tags, ...embeddingFields,
        article_html: articleHtml,
        article_text: articleText,
        author, site_name: siteName,
        hero_image_url: heroImageUrl,
        word_count: wordCount,
        reading_time_minutes: readingTimeMinutes,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("reading_list").select()
          .eq("user_id", user.id).eq("url", url).single();
        return NextResponse.json({ duplicate: true, item: existing }, { status: 409 });
      }
      console.error("[POST /api/items] supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Assign to project if requested — fire-and-forget
    if (projectId) {
      void supabase.from("project_items")
        .upsert({ project_id: projectId, item_id: savedItem.id }, { onConflict: "project_id,item_id", ignoreDuplicates: true });
    }

    // Auto-route to matching briefs — fire-and-forget
    if (embeddingVec) {
      autoRouteToBriefs(user.id, savedItem.id, embeddingVec).catch(() => {});
    }

    // Editorial annotation — fire-and-forget, never blocks the response.
    // Checks limit before firing so annotation doesn't silently exceed quota.
    checkAndLog(user.id, "editorial-note")
      .then(async (allowed) => {
        if (!allowed) return;
        const annotation = await generateEditorialNote(user.id, savedItem.id, title, summary);
        if (!annotation) return;
        await supabase.from("reading_list").update({
          editorial_note: annotation.note,
          editorial_references: annotation.references,
          editorial_generated_at: new Date().toISOString(),
        }).eq("id", savedItem.id);
      })
      .catch(() => {});

    return NextResponse.json(savedItem);
  } catch (e) {
    // Known extraction failures become first-class failed rows — no tags,
    // no embedding, no brief routing, no editorial note. Retryable in place.
    if (e instanceof ExtractionError) {
      const { data: failedItem, error } = await supabase
        .from("reading_list")
        .insert({
          user_id: user.id,
          url,
          title: titleFromUrl(url),
          status: "failed",
          failure_reason: e.reason,
        })
        .select()
        .single();
      if (error) {
        if (error.code === "23505") {
          const { data: existing } = await supabase
            .from("reading_list").select()
            .eq("user_id", user.id).eq("url", url).single();
          return NextResponse.json({ duplicate: true, item: existing }, { status: 409 });
        }
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (projectId) {
        void supabase.from("project_items")
          .upsert({ project_id: projectId, item_id: failedItem.id }, { onConflict: "project_id,item_id", ignoreDuplicates: true });
      }
      return NextResponse.json(failedItem);
    }
    const message =
      e instanceof Error ? e.message
      : e && typeof e === "object" && "message" in e ? String((e as Record<string, unknown>).message)
      : String(e);
    console.error("[POST /api/items] caught:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
