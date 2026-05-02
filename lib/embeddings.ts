import "server-only";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

export function buildEmbeddingText(
  title: string | null,
  summary: string | null,
  tags: string[] | null
): string {
  return [title ?? "", summary ?? "", (tags ?? []).join(" ")]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 8_000); // cap to avoid Gemini 400s on pathological input
}

/**
 * Parse a pgvector string "[0.1,0.2,...]" into a validated number[].
 * Returns null if the string is malformed or has unexpected dimensions.
 */
export function parseEmbedding(raw: unknown): number[] | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length !== EMBEDDING_DIM) return null;
    const nums = parsed as number[];
    if (nums.some(x => typeof x !== "number" || isNaN(x))) return null;
    return nums;
  } catch {
    return null;
  }
}

// API key goes in a header, not a query param, so it doesn't appear in logs
export async function embed(text: string): Promise<number[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model: `models/${EMBEDDING_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIM,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Gemini embedding error ${res.status}`);
  }
  const values = data.embedding.values as number[];
  if (values.length !== EMBEDDING_DIM) {
    throw new Error(`Expected ${EMBEDDING_DIM}-dim embedding, got ${values.length}`);
  }
  return values;
}
