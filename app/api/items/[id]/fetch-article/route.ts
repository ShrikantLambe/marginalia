import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { fetchArticle } from "@/lib/summarize";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-fetch article content for items saved before article extraction existed.
 *  Extraction only — no Gemini — so it never fails just because the summarizer
 *  is rate-limited or down; the item already has its summary. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: item } = await supabase
    .from("reading_list")
    .select("url, article_html")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.article_html) return NextResponse.json({ ok: true, cached: true });

  try {
    const content = await fetchArticle(item.url);
    await supabase.from("reading_list").update({
      article_html: content.articleHtml,
      article_text: content.articleText,
      author: content.author,
      site_name: content.siteName,
      hero_image_url: content.heroImageUrl,
      word_count: content.wordCount,
      reading_time_minutes: content.readingTimeMinutes,
    }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fetch article" }, { status: 500 });
  }
}
