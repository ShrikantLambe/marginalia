import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { redirect, notFound } from "next/navigation";
import { SynthesisView } from "./synthesis-view";
import type { Synthesis } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function SynthesisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { id } = await params;

  const { data } = await supabase
    .from("syntheses")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!data) notFound();

  return <SynthesisView synthesis={data as Synthesis} />;
}
