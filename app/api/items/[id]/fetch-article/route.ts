import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { fetchAndSummarize } from "@/lib/summarize";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-fetch article content for items saved before Phase 7. */
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
    const result = await fetchAndSummarize(item.url);
    await supabase.from("reading_list").update({
      article_html: result.articleHtml,
      article_text: result.articleText,
      author: result.author,
      site_name: result.siteName,
      hero_image_url: result.heroImageUrl,
      word_count: result.wordCount,
      reading_time_minutes: result.readingTimeMinutes,
    }).eq("id", id).eq("user_id", user.id);
    return NextResponse.json({ ok: true, cached: false });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to fetch article" }, { status: 500 });
  }
}
