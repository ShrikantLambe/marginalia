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

  // Single atomic UPDATE: last_opened_at bumped, scroll_progress moved up only
  // (GREATEST), and status flipped to 'read' at 100%. Avoids the read-then-write
  // race where concurrent 25/50/75/100% beacons could regress progress.
  await supabase.rpc("record_reading_progress", {
    p_item_id: id,
    p_user_id: user.id,
    p_progress: progress,
  });

  return NextResponse.json({ ok: true });
}
