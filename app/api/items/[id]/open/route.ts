import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const progress =
    typeof body.progress === "number" && body.progress >= 0 && body.progress <= 100
      ? Math.round(body.progress)
      : null;

  const updates: Record<string, unknown> = { last_opened_at: new Date().toISOString() };

  if (progress !== null) {
    // Only ever move progress upward — a re-open at the top must not erase 62%
    const { data: current } = await supabase
      .from("reading_list")
      .select("scroll_progress, status")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();
    if (current && progress > (current.scroll_progress ?? 0)) {
      updates.scroll_progress = progress;
      // Finishing the article marks it read, matching the manual flow
      if (progress >= 100 && current.status !== "read" && current.status !== "archived") {
        updates.status = "read";
        updates.read_at = new Date().toISOString();
      }
    }
  }

  await supabase
    .from("reading_list")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
