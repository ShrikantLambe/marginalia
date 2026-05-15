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

  return <ReaderView item={item} initialHighlights={highlights ?? []} />;
}
