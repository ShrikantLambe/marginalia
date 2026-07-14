import { NextResponse, after } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";
import { autoMatchItemsToBrief } from "@/lib/brief-routing";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const [{ data: brief }, { data: items }] = await Promise.all([
    supabase.from("briefs").select("*").eq("id", id).eq("user_id", user.id).single(),
    supabase
      .from("brief_items")
      .select("*, reading_list(*)")
      .eq("brief_id", id)
      .eq("user_dismissed", false)
      .order("added_at", { ascending: false }),
  ]);

  if (!brief) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ brief, items: items ?? [] });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.question !== undefined) updates.question = body.question;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) {
    const valid = ["open", "drafting", "closed", "archived"];
    if (!valid.includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === "closed" || body.status === "archived") {
      updates.closed_at = new Date().toISOString();
    }
  }
  if (body.closed_reason !== undefined) updates.closed_reason = body.closed_reason;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Re-embed if question or description changed
  const reEmbed = body.question !== undefined || body.description !== undefined;
  let newEmbeddingVec: number[] | null = null;
  if (reEmbed) {
    try {
      const { data: current } = await supabase
        .from("briefs").select("question, description").eq("id", id).eq("user_id", user.id).single();
      if (current) {
        const q = (updates.question as string | undefined) ?? current.question;
        const d = (updates.description as string | null | undefined) ?? current.description;
        const text = d ? `${q}\n\n${d}` : q;
        newEmbeddingVec = await embed(text);
        updates.embedding = `[${newEmbeddingVec.join(",")}]`;
      }
    } catch (e) {
      console.error("[PATCH /api/briefs] re-embed failed:", e);
    }
  }

  const { data, error } = await supabase
    .from("briefs").update(updates).eq("id", id).eq("user_id", user.id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Re-run auto-match with new embedding, deferred via after()
  if (newEmbeddingVec) {
    const vec = newEmbeddingVec;
    after(() => autoMatchItemsToBrief(user.id, id, vec).catch(() => {}));
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("briefs").delete().eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
