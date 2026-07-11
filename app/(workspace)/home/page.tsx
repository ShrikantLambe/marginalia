import { stackServerApp } from "@/stack";
import { redirect } from "next/navigation";
import { FrontPage } from "./front-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const firstName = (user.displayName ?? "").trim().split(/\s+/)[0] || null;

  return <FrontPage firstName={firstName} />;
}
