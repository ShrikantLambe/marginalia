import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { redirect, notFound } from "next/navigation";
import { SynthesisView } from "./synthesis-view";
import type { Synthesis } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SynthesisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { id } = await params;

  const { data } = await supabase
    .from("syntheses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!data) notFound();

  // Source items in citation order, so [n] links resolve in the preview
  const sourceIds = (data.source_item_ids as string[]) ?? [];
  const { data: srcRows } = sourceIds.length
    ? await supabase
        .from("reading_list")
        .select("id, title")
        .eq("user_id", user.id)
        .in("id", sourceIds)
    : { data: [] };
  const byId = new Map((srcRows ?? []).map((r) => [r.id, r.title as string | null]));
  const sources = sourceIds.map((sid) => ({ id: sid, title: byId.get(sid) ?? null }));

  return <SynthesisView synthesis={data as Synthesis} sources={sources} />;
}
