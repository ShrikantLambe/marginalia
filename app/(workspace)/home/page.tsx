import { stackServerApp } from "@/stack";
import { redirect } from "next/navigation";
import { topicFeeds } from "@/lib/tags";
import { FrontPage } from "./front-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const firstName = (user.displayName ?? "").trim().split(/\s+/)[0] || null;
  const topics = await topicFeeds(user.id, 8, 4);

  return <FrontPage firstName={firstName} topics={topics} />;
}
