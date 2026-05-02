import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabase";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export async function generateEditorialNote(
  userId: string,
  newItemId: string,
  newTitle: string | null,
  newSummary: string | null
): Promise<{ note: string; references: string[] } | null> {
  if (!newSummary) return null;

  // Fetch last 20 articles with summaries (excluding the new one)
  const { data: recent } = await supabase
    .from("reading_list")
    .select("id, title, summary")
    .eq("user_id", userId)
    .neq("id", newItemId)
    .not("summary", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (!recent || recent.length < 3) return null;

  const recentList = recent
    .map((item, i) => `${i + 1}. [${item.id}] ${item.title ?? "Untitled"} — ${item.summary}`)
    .join("\n");

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `You are a research assistant writing a one-sentence editorial note for a reader's saved article. The note helps the reader see how this article connects to, or contrasts with, what they have recently read.

Below are the reader's most recent articles with their summaries, then the new article.

Write ONE sentence — under 30 words — that does ONE of:
a) Connects this to a recurring theme in their reading.
b) Notes a contrast or contradiction with a specific prior article.
c) Identifies what is new or notable relative to their corpus.
d) Flags an unanswered question this article opens up.

Do NOT summarize the article. Do NOT use "this article discusses" or "interestingly".
DO reference specific prior articles by topic when applicable.

Return ONLY valid JSON with no markdown fencing:
{ "note": "...", "references": ["uuid1"] }

where references are item IDs from the list that the note explicitly references.
Use [] if no specific prior article is referenced.

RECENT READING:
${recentList}

NEW ARTICLE:
${newTitle ?? "Untitled"} — ${newSummary}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    const note = typeof parsed.note === "string" ? parsed.note.trim() : null;
    const references: string[] = Array.isArray(parsed.references)
      ? parsed.references.filter((r: unknown) => typeof r === "string")
      : [];
    if (!note) return null;
    return { note, references };
  } catch {
    return null;
  }
}
