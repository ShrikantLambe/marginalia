import { redirect } from "next/navigation";
import Link from "next/link";
import { stackServerApp } from "@/stack";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/app/components/PageHeader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hostname(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export default async function IndexPage() {
  const user = await stackServerApp.getUser();
  if (!user) redirect("/handler/sign-in");

  const { data: items } = await supabase
    .from("reading_list")
    .select("id, title, url, tags, status, created_at, reading_time_minutes")
    .eq("user_id", user.id)
    .neq("status", "failed")
    .order("title", { ascending: true });

  if (!items?.length) {
    return (
      <div className="max-w-2xl mx-auto px-8 py-10">
        <h1 className="font-serif text-[28px] font-semibold mb-8">
          Marg<span className="text-oxblood">i</span>nalia
        </h1>
        <p className="font-serif italic text-muted text-[16px]">No articles yet.</p>
      </div>
    );
  }

  // Build tag → articles map
  const tagMap: Record<string, typeof items> = {};
  const untagged: typeof items = [];

  for (const item of items) {
    if (!item.tags || item.tags.length === 0) {
      untagged.push(item);
      continue;
    }
    for (const tag of item.tags) {
      if (!tagMap[tag]) tagMap[tag] = [];
      tagMap[tag].push(item);
    }
  }

  const sortedTags = Object.keys(tagMap).sort((a, b) => a.localeCompare(b));

  // Group tags by first letter
  const letterGroups: Record<string, string[]> = {};
  for (const tag of sortedTags) {
    const letter = tag[0].toUpperCase();
    if (!letterGroups[letter]) letterGroups[letter] = [];
    letterGroups[letter].push(tag);
  }
  const letters = Object.keys(letterGroups).sort();

  return (
    <div className="max-w-3xl px-8 md:px-14 py-10">
      <PageHeader
        title="Index"
        caption={`${items.length} ${items.length === 1 ? "entry" : "entries"} · ${sortedTags.length} ${sortedTags.length === 1 ? "tag" : "tags"}, A–Z`}
      />

      {/* Letter index navigation */}
      {letters.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] tracking-[0.15em] uppercase text-muted mb-10">
          {letters.map(l => (
            <a key={l} href={`#letter-${l}`} className="hover:text-oxblood transition-colors">
              {l}
            </a>
          ))}
          {untagged.length > 0 && (
            <a href="#untagged" className="hover:text-oxblood transition-colors">—</a>
          )}
        </div>
      )}

      {/* Tag groups */}
      {letters.map(letter => (
        <div key={letter} id={`letter-${letter}`} className="mb-10">
          <div className="flex items-baseline gap-4 mb-4">
            <span className="font-serif text-[32px] font-semibold leading-none text-oxblood/40 select-none">
              {letter}
            </span>
            <hr className="flex-1 border-rule" />
          </div>

          <div className="space-y-6">
            {letterGroups[letter].map(tag => (
              <div key={tag} className="grid grid-cols-[200px_1fr] gap-6">
                {/* Tag name */}
                <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-sage pt-0.5">
                  {tag}
                  <span className="ml-2 text-muted">· {tagMap[tag].length}</span>
                </div>

                {/* Articles under this tag */}
                <ul className="space-y-2">
                  {tagMap[tag].map(item => (
                    <li key={item.id} className="flex items-baseline gap-3">
                      <Link
                        href={`/items/${item.id}`}
                        className="font-serif text-[15px] leading-snug hover:text-oxblood transition-colors flex-1"
                      >
                        {item.title || item.url}
                      </Link>
                      <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted flex-shrink-0">
                        {hostname(item.url)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Untagged */}
      {untagged.length > 0 && (
        <div id="untagged" className="mb-10">
          <div className="flex items-baseline gap-4 mb-4">
            <span className="font-serif text-[32px] font-semibold leading-none text-rule select-none">—</span>
            <hr className="flex-1 border-rule" />
          </div>
          <div className="grid grid-cols-[200px_1fr] gap-6">
            <div className="font-mono text-[10px] tracking-[0.15em] uppercase text-muted pt-0.5">
              Untagged · {untagged.length}
            </div>
            <ul className="space-y-2">
              {untagged.map(item => (
                <li key={item.id} className="flex items-baseline gap-3">
                  <Link
                    href={`/items/${item.id}`}
                    className="font-serif text-[15px] leading-snug hover:text-oxblood transition-colors flex-1"
                  >
                    {item.title || item.url}
                  </Link>
                  <span className="font-mono text-[9px] tracking-[0.1em] uppercase text-muted flex-shrink-0">
                    {hostname(item.url)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
