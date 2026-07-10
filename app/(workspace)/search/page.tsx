import { stackServerApp } from "@/stack";
import { redirect } from "next/navigation";
import { topTags } from "@/lib/tags";
import { SearchView } from "./search-view";

export const dynamic = "force-dynamic";

export default async function SearchPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const recentConcepts = await topTags(user.id, 8);

  return <SearchView recentConcepts={recentConcepts} />;
}
