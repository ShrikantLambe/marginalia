import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { generateEditorialNote } from "@/lib/editorial";
import { checkAndLog } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const itemIds: string[] = Array.isArray(body.item_ids) ? body.item_ids.slice(0, 5) : [];
  if (!itemIds.length) return NextResponse.json({ processed: 0 });

  let processed = 0;

  for (const id of itemIds) {
    const { data: item } = await supabase
      .from("reading_list")
      .select("title, summary, editorial_note")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (!item || item.editorial_note) continue;

    // Atomic check+log — stops loop if limit reached
    const allowed = await checkAndLog(user.id, "editorial-note");
    if (!allowed) break;

    const annotation = await generateEditorialNote(user.id, id, item.title, item.summary);
    if (!annotation) continue;

    await supabase.from("reading_list").update({
      editorial_note: annotation.note,
      editorial_references: annotation.references,
      editorial_generated_at: new Date().toISOString(),
    }).eq("id", id);

    processed++;
    await new Promise(r => setTimeout(r, 150));
  }

  return NextResponse.json({ processed });
}
