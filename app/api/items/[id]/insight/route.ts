import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { generateInsight } from "@/lib/chat";
import { checkAndLog } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const contextNote = typeof body.contextNote === "string" ? body.contextNote : null;

  const { data: item } = await supabase
    .from("reading_list")
    .select("id, article_text")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!item.article_text) return NextResponse.json({ error: "No article content" }, { status: 400 });

  const allowed = await checkAndLog(user.id, "chat-insight");
  if (!allowed) {
    return NextResponse.json({ error: "Daily AI limit reached. Try again tomorrow." }, { status: 429 });
  }

  const content = await generateInsight(item.article_text, contextNote);
  if (!content) return NextResponse.json({ error: "Could not generate insight" }, { status: 500 });

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      user_id: user.id,
      item_id: id,
      highlight_id: null,
      role: "assistant",
      content,
      trigger: "proactive",
      context_note: contextNote,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
