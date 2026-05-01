import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed, buildEmbeddingText, EMBEDDING_MODEL } from "@/lib/embeddings";

export const runtime = "nodejs";

const VALID_STATUSES = ["unread", "reading", "read", "archived"] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
    updates.read_at = body.status === "read" ? new Date().toISOString() : null;
  }

  if (body.notes !== undefined) updates.notes = body.notes;

  if (body.rating !== undefined) {
    if (body.rating !== null && (body.rating < 1 || body.rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }
    updates.rating = body.rating;
  }

  if (body.highlights !== undefined) updates.highlights = body.highlights;
  if (body.summary !== undefined) updates.summary = body.summary;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Re-embed if summary or tags changed
  if (body.summary !== undefined || body.tags !== undefined) {
    try {
      const { data: current } = await supabase
        .from("reading_list")
        .select("title, summary, tags")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (current) {
        const title = current.title;
        const summary = (updates.summary as string | undefined) ?? current.summary;
        const tags = (updates.tags as string[] | undefined) ?? current.tags;
        const vector = await embed(buildEmbeddingText(title, summary, tags));
        updates.embedding = `[${vector.join(",")}]`;
        updates.embedding_model = EMBEDDING_MODEL;
        updates.embedded_at = new Date().toISOString();
      }
    } catch (e) {
      console.error("[PATCH /api/items] re-embed failed:", e);
    }
  }

  const { data, error } = await supabase
    .from("reading_list")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { error } = await supabase
    .from("reading_list")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
