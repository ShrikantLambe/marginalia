import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { clusterUser } from "@/lib/clustering";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Find all users with ≥ 8 embedded items in the last 90 days
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rows } = await supabase
    .from("reading_list")
    .select("user_id")
    .not("embedding", "is", null)
    .gte("created_at", since);

  const counts = new Map<string, number>();
  for (const r of rows ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);

  const results: Record<string, string> = {};
  for (const [userId, count] of counts) {
    if (count < 8) { results[userId] = "skipped (< 8 items)"; continue; }
    try {
      const n = await clusterUser(userId);
      results[userId] = `${n} themes generated`;
    } catch (e) {
      results[userId] = `error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return NextResponse.json({ ok: true, results });
}
