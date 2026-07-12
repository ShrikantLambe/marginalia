import { stackServerApp } from "@/stack";
import { supabase, type Brief, type Source } from "@/lib/supabase";
import { redirect } from "next/navigation";
import { topTags } from "@/lib/tags";
import { FindView } from "./find-view";

export const dynamic = "force-dynamic";

export default async function FindPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const [sourcesRes, briefsRes, tags] = await Promise.all([
    supabase.from("sources").select("*").eq("user_id", user.id).order("created_at"),
    supabase
      .from("briefs")
      .select("id, question, status")
      .eq("user_id", user.id)
      .in("status", ["open", "drafting"])
      .order("created_at", { ascending: false }),
    topTags(user.id, 8),
  ]);

  return (
    <FindView
      sources={(sourcesRes.data ?? []) as Source[]}
      briefs={(briefsRes.data ?? []) as Pick<Brief, "id" | "question" | "status">[]}
      recentConcepts={tags}
      trySuggestions={tags.slice(0, 3)}
    />
  );
}
