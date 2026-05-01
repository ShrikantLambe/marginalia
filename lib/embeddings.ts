import "server-only";

export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_DIM = 768;

export function buildEmbeddingText(
  title: string | null,
  summary: string | null,
  tags: string[] | null
): string {
  return [title ?? "", summary ?? "", (tags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n");
}

// Uses the v1 REST endpoint directly — the @google/generative-ai SDK targets
// v1beta which does not expose text-embedding-004.
export async function embed(text: string): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${EMBEDDING_MODEL}:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini embedding error ${res.status}`);
  }
  return data.embedding.values as number[];
}
