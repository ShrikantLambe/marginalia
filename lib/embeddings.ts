import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIM = 768;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export function buildEmbeddingText(
  title: string | null,
  summary: string | null,
  tags: string[] | null
): string {
  return [title ?? "", summary ?? "", (tags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n");
}

export async function embed(text: string): Promise<number[]> {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent(text);
  return result.embedding.values;
}
