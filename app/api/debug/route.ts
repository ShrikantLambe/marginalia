import { NextResponse } from "next/server";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { embed } from "@/lib/embeddings";

export const runtime = "nodejs";

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Diagnostic endpoint — off by default. Set ENABLE_DEBUG_ENDPOINT=1 to use it.
  if (process.env.ENABLE_DEBUG_ENDPOINT !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const result: Record<string, unknown> = {};

  // 0. List available embedding models
  try {
    const listRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models",
      { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" } }
    );
    const listData = await listRes.json();
    const embeddingModels = (listData.models ?? [])
      .filter((m: { supportedGenerationMethods?: string[]; name?: string }) =>
        m.supportedGenerationMethods?.includes("embedContent")
      )
      .map((m: { name?: string }) => m.name);
    result.available_embedding_models = embeddingModels;
  } catch (e) {
    result.available_embedding_models = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 1. Can we embed?
  try {
    const vec = await embed("test");
    result.embed = `ok — ${vec.length}d vector`;
  } catch (e) {
    result.embed = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
  }

  // 2. Item counts
  result.stack_auth_user_id = user.id;

  const { data: counts } = await supabase
    .from("reading_list")
    .select("id, user_id, embedded_at")
    .eq("user_id", user.id);

  result.total_items = counts?.length ?? 0;
  result.items_with_embeddings = counts?.filter((r) => r.embedded_at).length ?? 0;
  result.items_missing_embeddings = counts?.filter((r) => !r.embedded_at).length ?? 0;

  // Count all rows regardless of user to detect project mismatch
  const { count: allRows, error: tableError } = await supabase
    .from("reading_list")
    .select("*", { count: "exact", head: true });
  result.total_rows_in_table = tableError
    ? `TABLE ERROR: ${tableError.message}`
    : (allRows ?? 0);

  // Whether the current user has any rows (does not leak other users' IDs)
  const { count: myRows } = await supabase
    .from("reading_list")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);
  result.current_user_row_count = myRows ?? 0;

  // 3. Does the RPC function exist?
  if (result.embed?.toString().startsWith("ok")) {
    const { error: rpcError } = await supabase.rpc("match_reading_list", {
      query_embedding: `[${Array(768).fill(0).join(",")}]`,
      match_user_id: user.id,
      match_threshold: 0.0,
      match_count: 1,
    });
    result.rpc = rpcError ? `FAILED: ${rpcError.message}` : "ok";
  }

  return NextResponse.json(result, { status: 200 });
}
