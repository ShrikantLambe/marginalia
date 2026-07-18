import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { buildAskPrompt, streamAskAnswer, type AskSource } from "@/lib/ask";
import { checkAndLog } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const { data: row } = await supabase
    .from("library_answers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!row) return new Response("Not found", { status: 404 });

  // Replay the cached answer without re-generating
  if (row.answer) {
    return new Response(row.answer, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const sourceIds = (row.source_item_ids as string[]) ?? [];
  if (sourceIds.length === 0) {
    const msg = "Nothing in your library covers this yet — try saving a few articles on the topic, or search the web through your sources.";
    await supabase.from("library_answers").update({ answer: msg }).eq("id", id);
    return new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const allowed = await checkAndLog(user.id, "ask");
  if (!allowed) {
    return new Response("Daily AI limit reached. Try again tomorrow.", { status: 429 });
  }

  // Fetch source content, preserving the stored (similarity) order
  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, summary, article_text")
    .eq("user_id", user.id)
    .in("id", sourceIds);
  const byId = new Map((items ?? []).map((i) => [i.id, i]));
  const sources: AskSource[] = sourceIds
    .map((sid) => byId.get(sid))
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .map((i) => ({ title: i.title, summary: i.summary, articleText: i.article_text }));

  const prompt = buildAskPrompt(row.question, sources);
  const streamResult = await streamAskAnswer(prompt);

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
          await supabase.from("library_answers").update({ answer: fullText }).eq("id", id);
        }
      } catch (e) {
        console.error(`[stream] ask ${id} failed:`, e instanceof Error ? e.message : String(e));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
