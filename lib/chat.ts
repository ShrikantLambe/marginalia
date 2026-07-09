import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ChatMessage } from "./supabase";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function buildChatPrompt(
  articleText: string,
  highlightText: string | null,
  history: ChatMessage[],
  question: string
): string {
  const textForGemini = articleText.slice(0, 12_000);

  const historySection = history.length
    ? `\nPRIOR CONVERSATION:\n${history
        .map((m) => `${m.role === "user" ? "Reader" : "You"}: ${m.content}`)
        .join("\n")}\n`
    : "";

  const passageSection = highlightText
    ? `\nThe reader has selected this specific passage to discuss:\n"${highlightText}"\n`
    : "";

  return `You are a reading companion answering questions about an article the reader has open, grounded only in its content. Be direct and specific — quote or reference the article rather than speaking generically. If the article does not contain the answer, say so plainly rather than guessing.

ARTICLE CONTENT:
${textForGemini}
${passageSection}${historySection}
Reader: ${question}
You:`;
}

export async function streamChatAnswer(prompt: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  return model.generateContentStream(prompt);
}

export function buildInsightPrompt(articleText: string, contextNote: string | null): string {
  const textForGemini = articleText.slice(0, 12_000);
  const behaviorSection = contextNote ? `\nReader behavior: ${contextNote}\n` : "";

  return `You are a reading companion. The reader appears to have paused partway through this article — perhaps re-reading a dense section or getting stuck.
${behaviorSection}
Write ONE short sentence — under 25 words — that either clarifies a likely point of confusion in the article, or asks a single specific question to prompt the reader's thinking. Do not summarize the article. Do not use "it seems like" or "interestingly".

Return ONLY the sentence, no quotes, no markdown.

ARTICLE CONTENT:
${textForGemini}`;
}

export async function generateInsight(
  articleText: string,
  contextNote: string | null
): Promise<string | null> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(buildInsightPrompt(articleText, contextNote));
    const text = result.response.text().trim();
    return text || null;
  } catch {
    return null;
  }
}
