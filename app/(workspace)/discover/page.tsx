import { stackServerApp } from "@/stack";
import { supabase, type Brief, type Source } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { topTags } from "@/lib/tags";
import { DiscoverView } from "./discover-view";

export const dynamic = "force-dynamic";

export default async function DiscoverPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const [sourcesRes, briefsRes, trySuggestions] = await Promise.all([
    supabase.from("sources").select("*").eq("user_id", user.id).order("created_at"),
    supabase
      .from("briefs")
      .select("id, question, status")
      .eq("user_id", user.id)
      .in("status", ["open", "drafting"])
      .order("created_at", { ascending: false }),
    topTags(user.id, 3),
  ]);

  return (
    <DiscoverView
      initialSources={(sourcesRes.data ?? []) as Source[]}
      briefs={(briefsRes.data ?? []) as Pick<Brief, "id" | "question" | "status">[]}
      trySuggestions={trySuggestions}
    />
  );
}
