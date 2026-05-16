import { redirect } from "next/navigation";
import { stackServerApp } from "@/stack";
import { QuickSaveForm } from "./quick-save-form";

export const runtime = "nodejs";

export default async function QuickSavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const user = await stackServerApp.getUser();
  const params = await searchParams;

  if (!user) {
    const callbackUrl = encodeURIComponent(
      `/quick-save?url=${encodeURIComponent(params.url ?? "")}&title=${encodeURIComponent(params.title ?? "")}${params.popup ? "&popup=1" : ""}`
    );
    redirect(`/handler/sign-in?after=${callbackUrl}`);
  }

  // Prefer explicit `url` param; fall back to `text` (used by Web Share Target)
  const initialUrl = params.url || params.text || "";
  const isPopup = params.popup === "1";

  return <QuickSaveForm initialUrl={initialUrl} isPopup={isPopup} />;
}
