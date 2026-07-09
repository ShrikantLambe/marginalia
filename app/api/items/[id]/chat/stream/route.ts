import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { buildChatPrompt, streamChatAnswer } from "@/lib/chat";
import { checkAndLog } from "@/lib/usage-log";
import type { ChatMessage } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const highlightId = typeof body.highlightId === "string" ? body.highlightId : null;
  if (!question) return new Response("question is required", { status: 400 });

  const { data: item } = await supabase
    .from("reading_list")
    .select("id, article_text")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!item) return new Response("Not found", { status: 404 });
  if (!item.article_text) return new Response("Article content not yet fetched.", { status: 400 });

  let highlightText: string | null = null;
  if (highlightId) {
    const { data: highlight } = await supabase
      .from("highlights")
      .select("text")
      .eq("id", highlightId)
      .eq("item_id", id)
      .eq("user_id", user.id)
      .single();
    if (!highlight) return new Response("Highlight not found", { status: 404 });
    highlightText = highlight.text;
  }

  const allowed = await checkAndLog(user.id, "chat");
  if (!allowed) {
    return new Response("Daily AI limit reached. Try again tomorrow.", { status: 429 });
  }

  let historyQuery = supabase
    .from("chat_messages")
    .select("*")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  historyQuery = highlightId
    ? historyQuery.eq("highlight_id", highlightId)
    : historyQuery.is("highlight_id", null);
  const { data: recentHistory } = await historyQuery;
  const history = ((recentHistory ?? []) as ChatMessage[]).reverse();

  await supabase.from("chat_messages").insert({
    user_id: user.id,
    item_id: id,
    highlight_id: highlightId,
    role: "user",
    content: question,
  });

  const prompt = buildChatPrompt(item.article_text, highlightText, history, question);
  const streamResult = await streamChatAnswer(prompt);

  let fullText = "";
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamResult.stream) {
          const text = chunk.text();
          fullText += text;
          controller.enqueue(enc.encode(text));
        }
        if (fullText.length >= 1) {
          await supabase.from("chat_messages").insert({
            user_id: user.id,
            item_id: id,
            highlight_id: highlightId,
            role: "assistant",
            content: fullText,
          });
        }
      } catch (e) {
        console.error(`[stream] chat ${id} failed:`, e instanceof Error ? e.message : String(e));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
