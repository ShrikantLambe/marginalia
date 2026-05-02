import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from "./supabase";
import { logUsage } from "./usage-log";
import { parseEmbedding } from "./embeddings";

// ── Cosine distance ──────────────────────────────────────────────────────────

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function meanVector(vecs: number[][]): number[] {
  const dim = vecs[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) sum[i] += v[i];
  return sum.map(x => x / vecs.length);
}

// ── DBSCAN ───────────────────────────────────────────────────────────────────

type Cluster = { indices: number[]; centroid: number[] };

// ── k-means (fallback for focused collections where DBSCAN finds 1 cluster) ──

function kmeans(vectors: number[][], k: number, maxIter = 50): Cluster[] {
  const n = vectors.length;
  // k-means++ init: first centroid random, remaining chosen by max distance
  const centroids: number[][] = [vectors[Math.floor(Math.random() * n)]];
  while (centroids.length < k) {
    let maxD = -1, pick = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.min(...centroids.map(c => cosineDistance(vectors[i], c)));
      if (d > maxD) { maxD = d; pick = i; }
    }
    centroids.push([...vectors[pick]]);
  }

  let labels = new Array<number>(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    const next = vectors.map(v => {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = cosineDistance(v, centroids[c]);
        if (d < bestD) { bestD = d; best = c; }
      }
      return best;
    });
    if (next.every((l, i) => l === labels[i])) break;
    labels = next;
    for (let c = 0; c < k; c++) {
      const pts = vectors.filter((_, i) => labels[i] === c);
      if (pts.length > 0) centroids[c] = meanVector(pts);
    }
  }

  const clusters: Cluster[] = [];
  for (let c = 0; c < k; c++) {
    const indices = labels.reduce<number[]>((acc, l, i) => l === c ? [...acc, i] : acc, []);
    if (indices.length >= 2)
      clusters.push({ indices, centroid: centroids[c] });
  }
  return clusters;
}

export function dbscan(
  points: number[][],
  epsilon: number,
  minPts: number
): Cluster[] {
  const n = points.length;
  const UNVISITED = -1, NOISE = -2;
  const labels = new Array<number>(n).fill(UNVISITED);
  let clusterIdx = 0;

  function neighbors(idx: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i !== idx && cosineDistance(points[idx], points[i]) <= epsilon)
        out.push(i);
    }
    return out;
  }

  for (let i = 0; i < n; i++) {
    if (labels[i] !== UNVISITED) continue;
    const nbrs = neighbors(i);
    if (nbrs.length < minPts - 1) { labels[i] = NOISE; continue; }

    labels[i] = clusterIdx;
    const seeds = [...nbrs];
    let j = 0;
    while (j < seeds.length) {
      const q = seeds[j++];
      if (labels[q] === NOISE) labels[q] = clusterIdx;
      if (labels[q] !== UNVISITED) continue;
      labels[q] = clusterIdx;
      const qn = neighbors(q);
      if (qn.length >= minPts - 1)
        for (const x of qn) if (!seeds.includes(x)) seeds.push(x);
    }
    clusterIdx++;
  }

  const clusters: Cluster[] = [];
  for (let c = 0; c < clusterIdx; c++) {
    const idx = labels.reduce<number[]>((acc, l, i) => (l === c ? [...acc, i] : acc), []);
    if (idx.length >= minPts)
      clusters.push({ indices: idx, centroid: meanVector(idx.map(i => points[i])) });
  }
  return clusters;
}

// ── Gemini cluster naming ────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

async function nameCluster(
  articles: Array<{ title: string | null; summary: string | null }>
): Promise<{ name: string; description: string }> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const list = articles
    .map((a, i) => `${i + 1}. ${a.title ?? "Untitled"} — ${a.summary ?? ""}`)
    .join("\n");

  const prompt = `You are naming a thematic cluster of articles a reader has been saving.
Given these article summaries, produce:

1. A short theme name (3-5 words, title case, no quotes).
2. A one-sentence description of what unifies these articles.

Be specific, not generic. "Data Engineering" is too broad; "Semantic Layer Adoption Patterns" is right. Avoid corporate-speak.

Output exactly two lines:
NAME: <theme name>
DESCRIPTION: <one sentence>

ARTICLES:
${list}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const name = text.match(/NAME:\s*(.+)/i)?.[1]?.trim() ?? `Theme (${articles.length} articles)`;
  const description = text.match(/DESCRIPTION:\s*(.+)/i)?.[1]?.trim() ?? null;
  return { name, description: description ?? "" };
}

// ── Main clustering function ─────────────────────────────────────────────────

export async function clusterUser(userId: string): Promise<number> {
  // Fetch items with embeddings from the last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, summary, embedding")
    .eq("user_id", userId)
    .not("embedding", "is", null)
    .gte("created_at", since);

  if (!items || items.length < 8) return 0;
  // Cap at 200 to avoid O(n²) DBSCAN timing out the cron (60s limit)
  // Take the most recent 200 if over the cap
  if (items.length > 200) items.splice(0, items.length - 200);

  // Parse and validate embedding vectors — drop items with malformed embeddings
  const validItems = items.filter(item => parseEmbedding(item.embedding) !== null);
  if (validItems.length < 8) return 0;
  const vectors = validItems.map(item => parseEmbedding(item.embedding)!);

  // 1. Try DBSCAN with adaptive epsilon (works well for diverse collections)
  const EPSILONS = [0.4, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75];
  let clusters: Cluster[] = [];
  for (const eps of EPSILONS) {
    clusters = dbscan(vectors, eps, 3);
    if (clusters.length >= 2) break;
  }
  if (clusters.length < 2) {
    for (const eps of EPSILONS) {
      clusters = dbscan(vectors, eps, 2);
      if (clusters.length >= 2) break;
    }
  }

  // 2. DBSCAN found ≤1 cluster — collection is focused on one domain.
  //    Use k-means to discover sub-themes within it.
  if (clusters.length < 2) {
    const k = Math.max(2, Math.min(5, Math.round(items.length / 4)));
    clusters = kmeans(vectors, k);
  }

  if (clusters.length === 0) return 0;

  // Load user-renamed themes to preserve names across re-runs
  const { data: existing } = await supabase
    .from("reading_themes")
    .select("name, description, item_ids")
    .eq("user_id", userId)
    .eq("user_renamed", true);

  const renamed = existing ?? [];

  // Build theme rows
  const rows = [];
  for (const cluster of clusters) {
    const clusterItems = cluster.indices.map(i => validItems[i]);
    const clusterIds = clusterItems.map(i => i.id as string);

    // Reuse a user-renamed name if >50% overlap with an existing theme
    const preserved = renamed.find(t => {
      const overlap = (t.item_ids as string[]).filter(id => clusterIds.includes(id)).length;
      return overlap / clusterIds.length > 0.5;
    });

    let name: string, description: string;
    if (preserved) {
      name = preserved.name;
      description = preserved.description ?? "";
    } else {
      try {
        ({ name, description } = await nameCluster(clusterItems));
        await logUsage(userId, "cluster-name").catch(() => {});
        await new Promise(r => setTimeout(r, 200)); // rate-limit Gemini
      } catch {
        name = `Theme (${clusterItems.length} articles)`;
        description = "";
      }
    }

    rows.push({
      user_id: userId,
      name,
      description,
      centroid: `[${cluster.centroid.join(",")}]`,
      item_ids: clusterIds,
      user_renamed: !!preserved,
    });
  }

  // Atomic swap: delete old themes, insert new
  await supabase.from("reading_themes").delete().eq("user_id", userId);
  if (rows.length > 0) await supabase.from("reading_themes").insert(rows);

  return rows.length;
}
