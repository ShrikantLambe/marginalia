import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Synthesis } from "@/lib/supabase";

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
    <main className="mx-auto max-w-3xl px-6 py-10 md:py-14">
      <header className="border-b border-rule pb-6 mb-10">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-1">
          <Link href="/dashboard" className="hover:text-ink transition-colors">← Dashboard</Link>
        </div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Past Drafts</h1>
      </header>

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
                  {s.title ?? "Untitled draft"}
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
