import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { dbscan } from "@/lib/clustering";
import { parseEmbedding } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, embedding")
    .eq("user_id", user.id)
    .not("embedding", "is", null);

  if (!items?.length) return NextResponse.json({ error: "No indexed items" });

  const rawVectors = items.map(i => parseEmbedding(i.embedding));
  const valid = items.filter((_, idx) => rawVectors[idx] !== null);
  const vectors = rawVectors.filter((v): v is number[] => v !== null);
  const n = vectors.length;

  // All pairwise distances
  const distances: number[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      distances.push(cosineDistance(vectors[i], vectors[j]));

  distances.sort((a, b) => a - b);
  const pct = (p: number) => distances[Math.floor(distances.length * p)];

  // Top 5 most similar pairs
  const pairs: Array<{ a: string; b: string; similarity: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(vectors[i], vectors[j]);
      pairs.push({ a: items[i].title ?? items[i].id, b: items[j].title ?? items[j].id, similarity: Math.round((1 - d) * 100) / 100 });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);

  // Cluster counts at various epsilon values
  const epsilonResults: Record<string, number> = {};
  for (const eps of [0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75]) {
    epsilonResults[`eps_${eps}_minPts_3`] = dbscan(vectors, eps, 3).length;
    epsilonResults[`eps_${eps}_minPts_2`] = dbscan(vectors, eps, 2).length;
  }

  return NextResponse.json({
    total_indexed: n,
    distance_distribution: {
      min: Math.round(distances[0] * 100) / 100,
      p25: Math.round(pct(0.25) * 100) / 100,
      median: Math.round(pct(0.5) * 100) / 100,
      p75: Math.round(pct(0.75) * 100) / 100,
      max: Math.round(distances[distances.length - 1] * 100) / 100,
    },
    top_5_similar_pairs: pairs.slice(0, 5),
    cluster_counts_by_epsilon: epsilonResults,
  });
}
