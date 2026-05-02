import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { clusterUser } from "@/lib/clustering";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("reading_themes")
    .select("*")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false });

  return NextResponse.json(data ?? []);
}

export async function POST() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Rate limit: once per hour
  const { data: latest } = await supabase
    .from("reading_themes")
    .select("generated_at")
    .eq("user_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (new Date(latest.generated_at) > hourAgo) {
      return NextResponse.json(
        { error: "Themes were refreshed recently. Try again in an hour." },
        { status: 429 }
      );
    }
  }

  // Need at least 8 embedded items
  const { count } = await supabase
    .from("reading_list")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .not("embedding", "is", null);

  if (!count || count < 8) {
    return NextResponse.json(
      { error: "Need at least 8 indexed articles to generate themes." },
      { status: 400 }
    );
  }

  const n = await clusterUser(user.id);
  return NextResponse.json({ ok: true, themes: n });
}
