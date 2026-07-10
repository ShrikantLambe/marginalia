import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Synthesis } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function SynthesesPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { data } = await supabase
    .from("syntheses")
    .select("id, title, prompt, source_item_ids, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const syntheses = (data ?? []) as Synthesis[];

  return (
    <main className="max-w-3xl px-8 md:px-14 py-10">
      <PageHeader title="Past Drafts" caption="Syntheses drawn from your reading." />

      {syntheses.length === 0 ? (
        <p className="font-serif italic text-ink/50 text-lg text-center py-20">
          No drafts yet. Select articles on the dashboard and click &ldquo;Draft from these&rdquo;.
        </p>
      ) : (
        <ol className="space-y-8">
          {syntheses.map((s) => (
            <li key={s.id} className="border-b border-rule pb-8">
              <Link href={`/synthesis/${s.id}`} className="group block">
                <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-2">
                  {new Date(s.created_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                  &nbsp;·&nbsp;
                  {s.source_item_ids.length} article{s.source_item_ids.length !== 1 ? "s" : ""}
                </div>
                <h2 className="font-serif text-xl font-semibold group-hover:text-oxblood transition-colors">
                  {s.title || `Draft · ${new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </h2>
                {s.prompt && (
                  <p className="font-serif italic text-ink/60 text-sm mt-1">{s.prompt}</p>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
