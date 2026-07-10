import { stackServerApp } from "@/stack";
import { supabase, type Brief } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { SourcesView } from "./sources-view";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { data: briefs } = await supabase
    .from("briefs")
    .select("id, question, status")
    .eq("user_id", user.id)
    .in("status", ["open", "drafting"])
    .order("created_at", { ascending: false });

  return <SourcesView briefs={(briefs ?? []) as Pick<Brief, "id" | "question" | "status">[]} />;
}
