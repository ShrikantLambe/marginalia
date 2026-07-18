import { notFound, redirect } from "next/navigation";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { ReaderView } from "./reader-view";

export const runtime = "nodejs";

export default async function ReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { id } = await params;

  const [{ data: item }, { data: highlights }] = await Promise.all([
    supabase
      .from("reading_list")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single(),
    supabase
      .from("highlights")
      .select("*")
      .eq("item_id", id)
      .eq("user_id", user.id)
      .order("position_start", { nullsFirst: false })
      .order("created_at"),
  ]);

  if (!item) notFound();

  // Related reading — nearest neighbours in the user's own library by embedding.
  // The stored embedding is already the pgvector text form, so no re-embed.
  let related: RelatedItem[] = [];
  if (item.embedding) {
    const { data } = await supabase.rpc("match_reading_list", {
      query_embedding: item.embedding as string,
      match_user_id: user.id,
      match_threshold: 0.4,
      match_count: 8,
    });
    related = ((data ?? []) as Array<Record<string, unknown>>)
      .filter((r) => r.id !== id && r.status !== "failed")
      .slice(0, 5)
      .map((r) => ({
        id: r.id as string,
        title: (r.title as string | null) ?? null,
        url: r.url as string,
        site_name: (r.site_name as string | null) ?? null,
      }));
  }

  return <ReaderView item={item} initialHighlights={highlights ?? []} related={related} />;
}

export type RelatedItem = { id: string; title: string | null; url: string; site_name: string | null };
