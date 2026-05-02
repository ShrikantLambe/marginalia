import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { generateEditorialNote } from "@/lib/editorial";
import { checkAndLog } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: item } = await supabase
    .from("reading_list")
    .select("title, summary")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const allowed = await checkAndLog(user.id, "editorial-note");
  if (!allowed) {
    return NextResponse.json({ error: "Daily AI limit reached. Try again tomorrow." }, { status: 429 });
  }

  const annotation = await generateEditorialNote(user.id, id, item.title, item.summary);
  if (!annotation) return NextResponse.json({ error: "Could not generate annotation" }, { status: 500 });

  const { data, error } = await supabase
    .from("reading_list")
    .update({
      editorial_note: annotation.note,
      editorial_references: annotation.references,
      editorial_generated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
