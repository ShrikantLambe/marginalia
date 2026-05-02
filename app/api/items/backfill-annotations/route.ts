import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { generateEditorialNote } from "@/lib/editorial";
import { checkDailyLimit, logUsage } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 60;

// Lazy backfill: annotate up to 5 visible items missing editorial notes
export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemIds: string[] = Array.isArray(body.item_ids) ? body.item_ids.slice(0, 5) : [];
  if (!itemIds.length) return NextResponse.json({ processed: 0 });

  let processed = 0;

  for (const id of itemIds) {
    const withinLimit = await checkDailyLimit(user.id);
    if (!withinLimit) break;

    const { data: item } = await supabase
      .from("reading_list")
      .select("title, summary, editorial_note")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!item || item.editorial_note) continue; // already has one

    const annotation = await generateEditorialNote(user.id, id, item.title, item.summary);
    if (!annotation) continue;

    await supabase.from("reading_list").update({
      editorial_note: annotation.note,
      editorial_references: annotation.references,
      editorial_generated_at: new Date().toISOString(),
    }).eq("id", id);

    await logUsage(user.id, "editorial-note");
    processed++;
    await new Promise(r => setTimeout(r, 150)); // rate-limit Gemini
  }

  return NextResponse.json({ processed });
}
