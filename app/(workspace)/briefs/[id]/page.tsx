import { notFound, redirect } from "next/navigation";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { BriefDetail } from "./brief-detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function BriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

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

  if (!brief) notFound();

  return <BriefDetail brief={brief} initialItems={items ?? []} />;
}
