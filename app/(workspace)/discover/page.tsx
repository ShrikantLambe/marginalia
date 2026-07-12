import { redirect } from "next/navigation";

// /discover merged into the unified /find page (Web mode).
export default async function DiscoverRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const parts = ["mode=web"];
  if (params.q) parts.push(`q=${encodeURIComponent(params.q)}`);
  if (params.run) parts.push(`run=${params.run}`);
  redirect(`/find?${parts.join("&")}`);
}
