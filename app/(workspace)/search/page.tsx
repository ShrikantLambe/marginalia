import { redirect } from "next/navigation";

// /search merged into the unified /find page (Library mode).
export default async function SearchRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const q = params.q ? `&q=${encodeURIComponent(params.q)}` : "";
  redirect(`/find?mode=library${q}`);
}
