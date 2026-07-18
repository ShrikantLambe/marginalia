import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { withRetry } from "./retry";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export type AskSource = {
  title: string | null;
  summary: string | null;
  articleText: string | null;
};

/**
 * Prompt for a cited answer grounded ONLY in the reader's own saved articles.
 * Sources are numbered; the model must cite claims with [n] matching them.
 */
export function buildAskPrompt(question: string, sources: AskSource[]): string {
  const numbered = sources
    .map((s, i) => {
      const body = (s.articleText ?? s.summary ?? "").slice(0, 1500);
      return `[${i + 1}] ${s.title ?? "Untitled"}\n${body}`;
    })
    .join("\n\n---\n\n");

  return `You are answering a question using ONLY the reader's own saved articles, listed below and numbered. Ground every claim in these sources and cite it with the matching [n] (e.g. "teams often skip this [2]"). You may cite more than one. If the sources do not answer the question, say so plainly — do not invent facts or cite sources that don't support the claim. Write 2–5 tight sentences (or a short paragraph); no preamble like "based on your articles".

SOURCES:
${numbered}

QUESTION: ${question}

ANSWER:`;
}

export async function streamAskAnswer(prompt: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  return withRetry(() => model.generateContentStream(prompt));
}
