import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { checkDailyLimit, logUsage } from "@/lib/usage-log";
import type { Highlight } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

function buildPrompt(
  items: Array<{
    title: string | null;
    url: string;
    summary: string | null;
    notes: string | null;
    highlights: Highlight[] | null;
  }>,
  angle: string | null
): string {
  const articleList = items
    .map((item, i) => {
      const parts = [
        `Article [${i + 1}]: ${item.title ?? item.url}`,
        `URL: ${item.url}`,
        `Summary: ${item.summary ?? "(no summary)"}`,
      ];
      if (item.notes) parts.push(`Notes: ${item.notes}`);
      if (item.highlights?.length) {
        parts.push(
          `Highlights:\n${item.highlights.map((h) => `  - "${h.text}"`).join("\n")}`
        );
      }
      return parts.join("\n");
    })
    .join("\n\n---\n\n");

  const angleSection = angle ? `\nThe writer wants this synthesis to: ${angle}\n` : "";

  return `You are helping a writer synthesize their reading into a draft article.
The writer has selected the following articles from their reading list,
along with their personal notes and highlights for each.

${articleList}
${angleSection}
Produce a draft with this structure:

1. A working headline (specific, not clickbait).
2. A 2-3 sentence lede establishing the question or tension.
3. 4-6 main sections, each with a header and 2-4 paragraphs of argument.
4. Inline citations as [1], [2] etc. corresponding to the source articles.
5. A "Sources" section listing the articles with their URLs.

Voice: practitioner-first, specific, willing to take a position. Avoid
listicles, "in today's fast-paced world" filler, hedging language.

Do not invent facts. If sources disagree, say so explicitly. If the
selected articles do not support a coherent thesis, say so and suggest
what is missing.`;
}

function extractTitle(draft: string): string {
  const first = draft.split("\n").find((l) => l.trim());
  if (!first) return "Untitled synthesis";
  return first.replace(/^#+\s*/, "").slice(0, 120);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;

  const { data: synthesis } = await supabase
    .from("syntheses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!synthesis) return new Response("Not found", { status: 404 });

  // Check daily limit before generating
  if (!synthesis.draft) {
    const withinLimit = await checkDailyLimit(user.id);
    if (!withinLimit) {
      return new Response("Daily AI limit reached. Try again tomorrow.", { status: 429 });
    }
  }

  // Already generated — stream the cached draft
  if (synthesis.draft) {
    return new Response(synthesis.draft, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Fetch source items with full detail
  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, url, summary, notes, highlights")
    .eq("user_id", user.id)
    .in("id", synthesis.source_item_ids as string[]);

  if (!items?.length) return new Response("Source items not found", { status: 404 });

  const prompt = buildPrompt(items as Parameters<typeof buildPrompt>[0], synthesis.prompt);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const streamResult = await model.generateContentStream(prompt);

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
        // Persist completed draft and log usage
        await Promise.all([
          supabase
            .from("syntheses")
            .update({ draft: fullText, title: extractTitle(fullText) })
            .eq("id", id),
          logUsage(user.id, "synthesize"),
        ]);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
