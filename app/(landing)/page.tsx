import { stackServerApp } from "@/stack";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await stackServerApp.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      {/* Masthead */}
      <header className="border-b border-rule pb-10 mb-12 rise">
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-muted mb-4">
          Vol. I &nbsp;·&nbsp; No. 1 &nbsp;·&nbsp; Est. 2026
        </div>
        <h1 className="font-serif text-6xl md:text-8xl font-semibold leading-[0.95] tracking-tight text-ink">
          Margin<span className="text-oxblood">a</span>lia
        </h1>
        <p className="mt-6 font-serif text-xl md:text-2xl text-ink/80 italic max-w-xl">
          A quiet reading list. Paste a link, get a TL;DR — keep what's worth
          coming back to.
        </p>
      </header>

      {/* Three-column manifesto */}
      <section className="grid md:grid-cols-3 gap-8 md:gap-10 mb-16 rise" style={{ animationDelay: "0.1s" }}>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-oxblood mb-2">
            I.
          </div>
          <h2 className="font-serif text-lg font-semibold mb-2">Paste</h2>
          <p className="font-serif text-base text-ink/75 leading-relaxed">
            Drop in any article URL. The kind of long read you keep meaning to
            come back to.
          </p>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-oxblood mb-2">
            II.
          </div>
          <h2 className="font-serif text-lg font-semibold mb-2">Distill</h2>
          <p className="font-serif text-base text-ink/75 leading-relaxed">
            Gemini reads it for you and writes a four-sentence TL;DR. Plus a
            handful of tags.
          </p>
        </div>
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-oxblood mb-2">
            III.
          </div>
          <h2 className="font-serif text-lg font-semibold mb-2">Return</h2>
          <p className="font-serif text-base text-ink/75 leading-relaxed">
            Browse your list later. Skim what you saved. Open the ones that
            still pull at you.
          </p>
        </div>
      </section>

      {/* Call to action */}
      <section className="border-t border-rule pt-10 rise" style={{ animationDelay: "0.2s" }}>
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Link
            href="/handler/sign-up"
            className="inline-block bg-oxblood text-paper px-7 py-3 font-mono text-xs tracking-[0.18em] uppercase hover:bg-ink transition-colors"
          >
            Begin a list
          </Link>
          <Link
            href="/handler/sign-in"
            className="font-serif text-base italic text-ink/70 link-underline"
          >
            or sign in to an existing one
          </Link>
        </div>
      </section>

      {/* Footer colophon */}
      <footer className="mt-24 pt-6 border-t border-rule font-mono text-[10px] tracking-[0.18em] uppercase text-muted">
        Set in Crimson Pro &nbsp;·&nbsp; Built on Next, Supabase, Stack Auth, Gemini
      </footer>
    </main>
  );
}
